// src/handlers/writeRssData.js
// ============================================================
// 从 KV 读取日报 Markdown，调用 Workers AI 生成摘要，
// 将 RSS 条目存入 D1 + KV，完全替代原 GitHub 路径
// ============================================================
import { replaceImageProxy, formatMarkdownText, formatDateToGMT8WithTime, removeMarkdownCodeBlock } from '../helpers.js';
import { getFromR2, storeInR2 } from '../r2storage.js';
import { upsertRssItem, listRecentRssItems } from '../d1database.js';
import { storeInKV } from '../kv.js';
import { marked } from '../marked.esm.js';
import { callChatAPI } from '../chatapi.js';
import { getSummarizationSimplifyPrompt } from '../prompt/summarizationSimplifyPrompt.js';
import { getAppUrl } from '../appUrl.js';

/**
 * 处理生成 RSS 内容的请求
 * 从 KV daily/ 读取原始内容 → Workers AI 生成摘要 → 写入 KV rss/
 */
export async function handleGenerateRssContent(request, env) {
    const url = new URL(request.url);
    const dateStr = url.searchParams.get('date');
    console.log(`[generateRssContent] date: ${dateStr}`);

    if (!dateStr) {
        return new Response('Missing date parameter', { status: 400 });
    }
    if (!env.DATA_KV) {
        return new Response('KV binding (DATA_KV) not configured', { status: 500 });
    }

    try {
        // 从 KV 读取日报原始内容
        const dailyKey = `daily/${dateStr}.md`;
        let content = await getFromR2(env.DATA_KV, dailyKey);

        if (!content) {
            return new Response(`No content found in KV for ${dailyKey}`, { status: 404 });
        }

        content = extractContentFromSecondHash(content);

        // 调用 Workers AI 生成精简 RSS 摘要
        const aiContent = await generateAIContent(env, content);

        // 写入 KV rss/ 目录
        const rssKey = `rss/${dateStr}.md`;
        await storeInR2(env.DATA_KV, rssKey, aiContent);
        console.log(`[generateRssContent] Wrote to KV: ${rssKey}`);

        const yearMonth = dateStr.substring(0, 7);
        const result = {
            report_date: dateStr,
            title: `${dateStr}日刊`,
            link: `/${yearMonth}/${dateStr}/`,
            content_markdown: aiContent,
            r2_key: rssKey,
            published_date: formatDateToGMT8WithTime(new Date()),
        };

        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[generateRssContent] Error:', error.message, error.stack);
        return new Response(`Error generating content: ${error.message}`, { status: 500 });
    }
}

/**
 * 处理写入 RSS 数据的请求
 * 从 R2 rss/ 读取已生成的内容 → 存入 D1 + KV
 */
export async function handleWriteRssData(request, env) {
    const url = new URL(request.url);
    const dateStr = url.searchParams.get('date');
    console.log(`[writeRssData] date: ${dateStr}`);

    if (!dateStr) {
        return new Response('Missing date parameter', { status: 400 });
    }
    if (!env.DATA_KV) {
        return new Response('KV binding (DATA_KV) not configured', { status: 500 });
    }

    try {
        const rssKey = `rss/${dateStr}.md`;
        let content = await getFromR2(env.DATA_KV, rssKey);

        if (!content) {
            return new Response(
                `No content found in KV for ${rssKey}. Please run /generateRssContent first.`,
                { status: 404 }
            );
        }

        const yearMonth = dateStr.substring(0, 7);
        const report = {
            report_date: dateStr,
            title: `${dateStr}日刊`,
            link: `/${yearMonth}/${dateStr}/`,
            content_html: marked.parse(formatMarkdownText(content)),
            published_date: formatDateToGMT8WithTime(new Date()),
        };

        // 存入 KV（快速读取缓存）
        const kvKey = `${dateStr}-report`;
        await storeInKV(env.DATA_KV, kvKey, report);
        console.log(`[writeRssData] Stored in KV: ${kvKey}`);

        // 存入 D1（结构化查询）
        if (env.DB) {
            try {
                await upsertRssItem(env.DB, {
                    report_date: dateStr,
                    title: report.title,
                    link: report.link,
                    content_markdown: content,
                });
                console.log(`[writeRssData] Stored in D1: ${dateStr}`);
            } catch (dbErr) {
                console.warn('[writeRssData] D1 save failed (non-fatal):', dbErr.message);
            }
        }

        return new Response(JSON.stringify(report), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[writeRssData] Error:', error.message, error.stack);
        return new Response(`Error handling daily report: ${error.message}`, { status: 500 });
    }
}

// ——— 内部工具函数 ———

export function extractContentFromSecondHash(content) {
    const parts = content.split('###');
    if (parts.length > 2) {
        let newcontent = '###' + parts.slice(2).join('###');
        const lastHashIndex = newcontent.lastIndexOf('AI资讯日报语音版');
        if (lastHashIndex !== -1) {
            newcontent = newcontent.substring(0, lastHashIndex - 10);
        }
        return newcontent;
    }
    return content;
}

export function truncateContent(content, maxLength = 150) {
    if (!content || content.length <= maxLength) return content;
    let truncated = content.substring(0, maxLength);
    const lastNewlineEnd = truncated.lastIndexOf('\n');
    if (lastNewlineEnd > maxLength / 2) {
        truncated = content.substring(0, lastNewlineEnd);
    }
    truncated += '\n\n......\n\n*[剩余内容已省略]*';
    return truncated;
}

export async function generateAIContent(env, promptText) {
    console.log(`[generateAIContent] Calling Workers AI, prompt length: ${promptText.length}`);
    try {
        let result = await callChatAPI(env, promptText, getSummarizationSimplifyPrompt());
        result = removeMarkdownCodeBlock(result);
        result = truncateContent(result, 360);
        result += '\n\n</br>' + getAppUrl();
        return result;
    } catch (error) {
        console.error('[generateAIContent] Error:', error.message);
        throw new Error(`Failed to generate AI content: ${error.message}`);
    }
}
