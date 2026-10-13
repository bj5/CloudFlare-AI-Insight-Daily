// src/index.js
// ============================================================
// Cloudflare Workers 主入口
// 全栈零服务器：Workers AI + KV + D1 + Cron Triggers
// ============================================================
import { handleWriteData } from './handlers/writeData.js';
import { handleGetContent } from './handlers/getContent.js';
import { handleGetContentHtml } from './handlers/getContentHtml.js';
import { handleGenAIContent, handleGenAIPodcastScript, handleGenAIDailyAnalysis } from './handlers/genAIContent.js';
import { handleGenAIDailyPage } from './handlers/genAIDailyPage.js';
import { handleCommitToGitHub } from './handlers/commitToGitHub.js';
import { handleRss } from './handlers/getRss.js';
import { handleWriteRssData, handleGenerateRssContent } from './handlers/writeRssData.js';
import { dataSources } from './dataFetchers.js';
import { handleLogin, isAuthenticated, handleLogout } from './auth.js';
import { serveFromR2 } from './r2storage.js';
import { initializeDatabase } from './d1database.js';
import { fetchAllData } from './dataFetchers.js';
import { storeInKV } from './kv.js';

export default {
    // ——— HTTP 请求处理 ———
    async fetch(request, env) {
        // 检查核心 bindings（Workers AI + KV）
        const requiredBindings = ['DATA_KV', 'AI'];
        const missingBindings = requiredBindings.filter(b => !env[b]);

        if (missingBindings.length > 0) {
            console.error(`CRITICAL: Missing bindings: ${missingBindings.join(', ')}`);
            return new Response(`
                <!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>配置错误</title></head>
                <body style="font-family:sans-serif;padding:20px">
                <h1>服务配置错误</h1>
                <p>以下 Binding 未配置: <strong>${missingBindings.join(', ')}</strong></p>
                <p>请检查 wrangler.toml 中的 ai / kv_namespaces 配置。</p>
                </body></html>`,
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        }

        // 初始化 D1（幂等，仅在首次执行）
        if (env.DB) {
            try {
                await initializeDatabase(env.DB);
            } catch (e) {
                console.warn('D1 initialization warning (non-fatal):', e.message);
            }
        }

        const url = new URL(request.url);
        const path = url.pathname;
        console.log(`Request: ${request.method} ${path}`);

        // ——— 公开路由（无需认证）———
        if (path === '/login') {
            return await handleLogin(request, env);
        } else if (path === '/logout') {
            return await handleLogout(request, env);
        } else if (path === '/getContent' && request.method === 'GET') {
            return await handleGetContent(request, env);
        } else if (path.startsWith('/rss') && request.method === 'GET') {
            return await handleRss(request, env);
        } else if (path === '/writeRssData' && request.method === 'GET') {
            return await handleWriteRssData(request, env);
        } else if (path === '/generateRssContent' && request.method === 'GET') {
            return await handleGenerateRssContent(request, env);
        }

        // ——— KV 公开内容服务（直接通过 Worker 访问 KV 对象）———
        // /r2/daily/2026-10-13.md  →  KV key: daily/2026-10-13.md
        if (path.startsWith('/r2/') && request.method === 'GET') {
            const r2Key = path.substring(4); // 去掉 /r2/ 前缀
            if (!r2Key || r2Key.includes('..')) {
                return new Response('Invalid path', { status: 400 });
            }
            return await serveFromR2(env.DATA_KV, r2Key);
        }

        // ——— 认证检查 ———
        const { authenticated, cookie: newCookie } = await isAuthenticated(request, env);
        if (!authenticated) {
            const loginUrl = new URL('/login', url.origin);
            loginUrl.searchParams.set('redirect', url.pathname + url.search);
            return Response.redirect(loginUrl.toString(), 302);
        }

        // ——— 需要认证的路由 ———
        let response;
        try {
            if (path === '/writeData' && request.method === 'POST') {
                response = await handleWriteData(request, env);
            } else if (path === '/getContentHtml' && request.method === 'GET') {
                const dataCategories = Object.keys(dataSources).map(key => ({
                    id: key,
                    name: dataSources[key].name
                }));
                response = await handleGetContentHtml(request, env, dataCategories);
            } else if (path === '/genAIContent' && request.method === 'POST') {
                response = await handleGenAIContent(request, env);
            } else if (path === '/genAIPodcastScript' && request.method === 'POST') {
                response = await handleGenAIPodcastScript(request, env);
            } else if (path === '/genAIDailyAnalysis' && request.method === 'POST') {
                response = await handleGenAIDailyAnalysis(request, env);
            } else if (path === '/genAIDailyPage' && request.method === 'GET') {
                response = await handleGenAIDailyPage(request, env);
            } else if (path === '/commitToGitHub' && request.method === 'POST') {
                // 实际存储到 R2，保留路由名称以兼容前端
                response = await handleCommitToGitHub(request, env);
            } else {
                return new Response(null, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        } catch (e) {
            console.error('Unhandled error in fetch handler:', e);
            return new Response(`Internal Server Error: ${e.message}`, { status: 500 });
        }

        // 续期 Cookie
        if (newCookie) {
            response.headers.append('Set-Cookie', newCookie);
        }
        return response;
    },

    // ——— Cron Trigger 处理（替代 cron-docker）———
    // 在 wrangler.toml 中配置: [[triggers.crons]] = "0 2 * * *"（UTC 02:00 = 北京 10:00）
    async scheduled(event, env, ctx) {
        console.log(`Cron triggered: ${event.cron} at ${new Date().toISOString()}`);

        // 初始化 D1
        if (env.DB) {
            try {
                await initializeDatabase(env.DB);
            } catch (e) {
                console.warn('D1 init warning:', e.message);
            }
        }

        // 获取今日日期（上海时区）
        const dateStr = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });

        console.log(`Running daily data fetch for date: ${dateStr}`);

        ctx.waitUntil(runDailyPipeline(env, dateStr));
    },
};

/**
 * 每日自动化管道：
 * 1. 抓取所有数据源并存入 KV
 * 日报生成需要人工在后台触发（通过 UI），因为需要手动选择条目
 *
 * @param {object} env - 环境对象
 * @param {string} dateStr - YYYY-MM-DD
 */
async function runDailyPipeline(env, dateStr) {
    try {
        console.log(`[Cron] Starting daily pipeline for ${dateStr}`);

        // Step 1: 抓取所有数据源数据，写入 KV
        const allData = await fetchAllData(env, null);
        const storePromises = [];
        for (const [sourceType, data] of Object.entries(allData)) {
            if (data && data.length > 0) {
                storePromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, data));
                console.log(`[Cron] Stored ${data.length} items for ${sourceType}`);
            }
        }
        await Promise.allSettled(storePromises);

        console.log(`[Cron] Daily pipeline completed for ${dateStr}`);
    } catch (error) {
        console.error(`[Cron] Pipeline failed for ${dateStr}:`, error);
    }
}
