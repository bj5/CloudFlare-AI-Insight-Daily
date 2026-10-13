// src/handlers/commitToGitHub.js  →  现在改为 commitToKV.js
// ============================================================
// 将日报 / 播客 Markdown 内容存储到 Cloudflare KV
// 同时将元数据写入 D1，替代原来的 GitHub commit 流程
// ============================================================
import { getISODate, formatMarkdownText, formatDateToChinese } from '../helpers.js';
import { storeInR2 } from '../r2storage.js';
import { upsertDailyReport } from '../d1database.js';

export async function handleCommitToGitHub(request, env) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    try {
        const formData = await request.formData();
        const dateStr = formData.get('date') || getISODate();
        const dailyMd = formData.get('daily_summary_markdown');
        const podcastMd = formData.get('podcast_script_markdown');

        if (!dailyMd && !podcastMd) {
            throw new Error('No markdown content provided for storage.');
        }

        if (!env.DATA_KV) {
            throw new Error('KV binding (DATA_KV) is not configured in wrangler.toml.');
        }

        const results = [];
        let dailyR2Key = null;
        let podcastR2Key = null;

        // 存储日报到 KV
        if (dailyMd) {
            dailyR2Key = `daily/${dateStr}.md`;
            try {
                await storeInR2(env.DATA_KV, dailyR2Key, formatMarkdownText(dailyMd));
                results.push({ file: dailyR2Key, status: 'Success', message: 'Stored to KV.' });
                console.log(`KV store success: ${dailyR2Key}`);
            } catch (err) {
                console.error(`Failed to store ${dailyR2Key} to KV:`, err);
                results.push({ file: dailyR2Key, status: 'Failed', message: err.message });
            }
        }

        // 存储播客脚本到 KV
        if (podcastMd) {
            podcastR2Key = `podcast/${dateStr}.md`;
            try {
                await storeInR2(env.DATA_KV, podcastR2Key, podcastMd);
                results.push({ file: podcastR2Key, status: 'Success', message: 'Stored to KV.' });
                console.log(`KV store success: ${podcastR2Key}`);
            } catch (err) {
                console.error(`Failed to store ${podcastR2Key} to KV:`, err);
                results.push({ file: podcastR2Key, status: 'Failed', message: err.message });
            }
        }

        // 将元数据写入 D1（如果有绑定）
        if (env.DB && dailyR2Key) {
            try {
                // 从日报内容中提取摘要（取 ```...``` 块内容）
                const summaryMatch = dailyMd.match(/```\s*([\s\S]*?)```/);
                const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 500) : '';

                await upsertDailyReport(env.DB, {
                    report_date: dateStr,
                    title: `${env.DAILY_TITLE || 'AI洞察日报'} ${formatDateToChinese(dateStr)}`,
                    summary,
                    r2_key: dailyR2Key,
                    podcast_r2_key: podcastR2Key,
                });
                console.log(`D1 metadata saved for date: ${dateStr}`);
            } catch (dbErr) {
                console.warn('Failed to save metadata to D1 (non-fatal):', dbErr.message);
            }
        }

        return new Response(JSON.stringify({ status: 'success', date: dateStr, results }), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

    } catch (error) {
        console.error('Error in /commitToGitHub (KV path):', error);
        return new Response(JSON.stringify({ status: 'error', message: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}
