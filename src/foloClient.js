// src/foloClient.js
// ============================================================
// Folo (formerly Follow.is) 统一客户端模块
// 基于 https://github.com/RSSNext/Folo 最新版本标准进行重构
// 集中管理 API 请求、认证 Header、Cookie 规范化、分页与错误处理
// ============================================================

import { getRandomUserAgent, sleep, isDateWithinLastDays, stripHtml, escapeHtml, formatDateToChineseWithTime } from './helpers.js';
import { getFromKV } from './kv.js';

export const FOLO_CONFIG = {
    DEFAULT_API: 'https://api.folo.is/entries',
    DEFAULT_APP_VERSION: '0.5.11',
    ORIGIN: 'https://app.folo.is',
    REFERER: 'https://app.folo.is/',
    APP_NAME: 'Folo Web',
};

/**
 * 将输入的 Cookie 或 Token 自动规范化
 * - 若已包含 key=value（如 authjs.session-token=...），保持原样
 * - 若仅传入 JWT/Token 裸字符，自动补全为 authjs.session-token=...
 *
 * @param {string} cookieStr
 * @returns {string} 规范化的 Cookie 字符串
 */
export function formatFoloCookie(cookieStr) {
    if (!cookieStr || typeof cookieStr !== 'string') return '';
    const trimmed = cookieStr.trim();
    if (!trimmed) return '';
    if (trimmed.includes('=')) {
        return trimmed;
    }
    return `authjs.session-token=${trimmed}`;
}

/**
 * 提取 Session Token（用于可选的 Bearer Header 补充）
 *
 * @param {string} cookieStr
 * @returns {string|null}
 */
export function extractSessionToken(cookieStr) {
    if (!cookieStr || typeof cookieStr !== 'string') return null;
    const trimmed = cookieStr.trim();
    if (!trimmed.includes('=')) {
        return trimmed.startsWith('ey') ? trimmed : null;
    }
    const match = trimmed.match(/(?:authjs\.session-token|__Secure-authjs\.session-token)=([^;\s]+)/);
    return match ? match[1] : null;
}

/**
 * 统一获取 Folo Cookie
 * 优先级：显式参数 > 环境变量/Secret (env.FOLO_COOKIE) > KV 中持久化的 Cookie
 *
 * @param {object} env
 * @param {string|null} [explicitCookie=null]
 * @returns {Promise<string|null>}
 */
export async function resolveFoloCookie(env, explicitCookie = null) {
    if (explicitCookie && typeof explicitCookie === 'string' && explicitCookie.trim()) {
        return formatFoloCookie(explicitCookie.trim());
    }

    if (env.FOLO_COOKIE && typeof env.FOLO_COOKIE === 'string' && env.FOLO_COOKIE.trim()) {
        return formatFoloCookie(env.FOLO_COOKIE.trim());
    }

    if (env.DATA_KV) {
        const kvKey = env.FOLO_COOKIE_KV_KEY || 'folo_auth_cookie';
        try {
            const saved = await getFromKV(env.DATA_KV, kvKey);
            if (saved && typeof saved === 'string' && saved.trim()) {
                return formatFoloCookie(saved.trim());
            }
        } catch (e) {
            console.warn(`[FoloClient] 读取 KV 中的 Folo Cookie 警告: ${e.message}`);
        }
    }

    return null;
}

/**
 * 构建与最新 Folo Web (https://app.folo.is/) 完全对齐的请求标头
 *
 * @param {object} env
 * @param {string|null} cookie
 * @returns {object} headers 对象
 */
export function buildFoloHeaders(env, cookie) {
    const userAgent = getRandomUserAgent();
    const appVersion = env.FOLO_APP_VERSION || FOLO_CONFIG.DEFAULT_APP_VERSION;

    const headers = {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'origin': FOLO_CONFIG.ORIGIN,
        'referer': FOLO_CONFIG.REFERER,
        'priority': 'u=1, i',
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'x-app-name': FOLO_CONFIG.APP_NAME,
        'x-app-version': appVersion,
    };

    if (cookie) {
        const formattedCookie = formatFoloCookie(cookie);
        headers['Cookie'] = formattedCookie;

        const token = extractSessionToken(formattedCookie);
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    return headers;
}

/**
 * 通用 Folo 数据拉取方法
 * 支持通过 listId 或 feedId 进行按页拉取，过滤日期范围，并组装为统一的 Feed 结构
 *
 * @param {object} env - Cloudflare Worker 环境变量
 * @param {object} options
 * @param {string} [options.listId] - Folo 列表 ID
 * @param {string} [options.feedId] - Folo 单源 feed ID
 * @param {string} [options.sourceTitle="Folo Feeds"] - 标题
 * @param {number} [options.fetchPages=1] - 抓取页数
 * @param {number} [options.filterDays=1] - 时间过滤天数
 * @param {string|null} [options.foloCookie=null] - Cookie
 * @param {function} [options.formatSource] - 自定义来源名称格式化函数
 * @param {number} [options.view=1] - 视图类型，默认 1
 * @param {boolean} [options.withContent=true] - 是否携带正文
 * @returns {Promise<object>} 标准 JSONFeed 结构
 */
export async function fetchFoloEntries(env, options = {}) {
    const {
        listId,
        feedId,
        sourceTitle = 'Folo Feeds',
        fetchPages = 1,
        foloCookie = null,
        formatSource = null,
        view = 1,
        withContent = true,
    } = options;

    const filterDays = parseInt(options.filterDays || env.FOLO_FILTER_DAYS || '1', 10);
    const targetId = listId || feedId;

    if (!targetId) {
        console.warn(`[FoloClient] 未配置 listId 或 feedId，跳过 ${sourceTitle} 抓取`);
        return {
            version: 'https://jsonfeed.org/version/1.1',
            title: sourceTitle,
            home_page_url: FOLO_CONFIG.ORIGIN,
            description: `Aggregated from ${sourceTitle}`,
            language: 'zh-cn',
            items: [],
        };
    }

    const apiUrl = env.FOLO_DATA_API || FOLO_CONFIG.DEFAULT_API;
    const cookie = await resolveFoloCookie(env, foloCookie);
    const allItems = [];
    let publishedAfter = null;

    console.log(`[FoloClient] 开始拉取 [${sourceTitle}], targetId=${targetId}, 页数=${fetchPages}, 鉴权存在=${!!cookie}`);

    for (let page = 0; page < fetchPages; page++) {
        const headers = buildFoloHeaders(env, cookie);
        const body = {
            view,
            withContent,
        };

        if (listId) {
            body.listId = listId;
        } else if (feedId) {
            body.feedId = feedId;
        }

        if (publishedAfter) {
            body.publishedAfter = publishedAfter;
        }

        try {
            console.log(`[FoloClient] [${sourceTitle}] 请求第 ${page + 1}/${fetchPages} 页...`);
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const status = response.status;
                const statusText = response.statusText;
                let errorDetails = '';
                try {
                    errorDetails = await response.text();
                } catch (_) {}

                if (status === 401 || status === 403) {
                    console.error(`[FoloClient] [${sourceTitle}] 认证失败 (${status}): Cookie 可能已过期或无效。请在后台或通过 wrangler secret 更新 FOLO_COOKIE。响应: ${errorDetails}`);
                } else {
                    console.error(`[FoloClient] [${sourceTitle}] 请求失败: ${status} ${statusText} - ${errorDetails}`);
                }
                break;
            }

            const data = await response.json();
            const entriesList = data?.data || [];

            if (entriesList.length === 0) {
                console.log(`[FoloClient] [${sourceTitle}] 第 ${page + 1} 页无更多数据返回。`);
                break;
            }

            // 日期过滤
            const filteredEntries = entriesList.filter(entry => {
                const pubDate = entry?.entries?.publishedAt;
                return pubDate ? isDateWithinLastDays(pubDate, filterDays) : false;
            });

            for (const entry of filteredEntries) {
                const e = entry.entries || {};
                const f = entry.feeds || {};

                let sourceName = f.title || sourceTitle;
                if (typeof formatSource === 'function') {
                    sourceName = formatSource(entry);
                } else if (e.author) {
                    sourceName = f.title ? `${f.title} - ${e.author}` : e.author;
                }

                allItems.push({
                    id: e.id,
                    url: e.url || '',
                    title: e.title || '无标题',
                    content_html: e.content || '',
                    date_published: e.publishedAt || new Date().toISOString(),
                    authors: [{ name: e.author || f.title || 'Unknown' }],
                    source: sourceName,
                });
            }

            publishedAfter = entriesList[entriesList.length - 1]?.entries?.publishedAt;

            // 如果该页中已有条目超出指定天数范围，后续页面的时间更早，可提前终止
            if (filteredEntries.length < entriesList.length) {
                console.log(`[FoloClient] [${sourceTitle}] 检测到超出 ${filterDays} 天范围的条目，提前结束后续页翻页。`);
                break;
            }

        } catch (error) {
            console.error(`[FoloClient] [${sourceTitle}] 第 ${page + 1} 页抓取发生网络或解析异常:`, error);
            break;
        }

        if (page < fetchPages - 1) {
            await sleep(1000 + Math.random() * 2000);
        }
    }

    console.log(`[FoloClient] [${sourceTitle}] 抓取完成，符合日期条目数: ${allItems.length}`);

    return {
        version: 'https://jsonfeed.org/version/1.1',
        title: sourceTitle,
        home_page_url: FOLO_CONFIG.ORIGIN,
        description: `Aggregated items from ${sourceTitle}`,
        language: 'zh-cn',
        items: allItems,
    };
}

/**
 * 通用数据转换器（将 JSONFeed 格式映射为系统的统一数据结构）
 *
 * @param {object} rawData
 * @param {string} sourceType
 * @param {string} [defaultSourceName='Folo']
 * @returns {Array<object>}
 */
export function transformFoloFeed(rawData, sourceType, defaultSourceName = 'Folo') {
    if (!rawData || !Array.isArray(rawData.items)) {
        return [];
    }

    return rawData.items.map(item => ({
        id: item.id,
        type: sourceType,
        url: item.url,
        title: item.title,
        description: stripHtml(item.content_html || ''),
        published_date: item.date_published,
        authors: item.authors ? item.authors.map(a => a.name).join(', ') : 'Unknown',
        source: item.source || defaultSourceName,
        details: {
            content_html: item.content_html || '',
        },
    }));
}

/**
 * 通用 HTML 渲染器
 *
 * @param {object} item
 * @param {string} [actionText='阅读更多']
 * @returns {string}
 */
export function generateFoloHtml(item, actionText = '阅读更多') {
    return `
        <strong>${escapeHtml(item.title)}</strong><br>
        <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
        <div class="content-html">${item.details.content_html || '无正文内容。'}</div>
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(actionText)}</a>
    `;
}
