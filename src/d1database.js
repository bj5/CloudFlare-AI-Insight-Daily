// src/d1database.js
// ============================================================
// Cloudflare D1 数据库模块
// 用于存储结构化的日报元数据（标题、日期、摘要、内容路径等）
// 使 /rss 端点可以从 D1 直接查询，无需访问 R2 全文
// ============================================================

/**
 * 初始化 D1 数据库表（首次部署时调用）
 * 在 wrangler.toml 中通过 migrations 或 exec 完成，
 * 此函数可在 Worker 启动时幂等执行。
 *
 * @param {D1Database} db - D1 binding（env.DB）
 */
export async function initializeDatabase(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS daily_reports (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            report_date TEXT    NOT NULL UNIQUE,  -- YYYY-MM-DD
            title       TEXT    NOT NULL,
            summary     TEXT,                     -- AI 生成的今日摘要（纯文本）
            r2_key      TEXT    NOT NULL,          -- R2 对象键，如 daily/2026-10-13.md
            podcast_r2_key TEXT,                  -- 播客脚本 R2 键
            published_at TEXT    NOT NULL          -- ISO 8601
        );

        CREATE TABLE IF NOT EXISTS rss_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            report_date     TEXT    NOT NULL UNIQUE,
            title           TEXT    NOT NULL,
            link            TEXT    NOT NULL,
            content_markdown TEXT   NOT NULL,
            published_at    TEXT    NOT NULL
        );
    `);
}

/**
 * 插入或更新日报记录
 *
 * @param {D1Database} db
 * @param {{report_date: string, title: string, summary?: string, r2_key: string, podcast_r2_key?: string}} report
 */
export async function upsertDailyReport(db, report) {
    const now = new Date().toISOString();
    await db.prepare(`
        INSERT INTO daily_reports (report_date, title, summary, r2_key, podcast_r2_key, published_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(report_date) DO UPDATE SET
            title          = excluded.title,
            summary        = excluded.summary,
            r2_key         = excluded.r2_key,
            podcast_r2_key = COALESCE(excluded.podcast_r2_key, podcast_r2_key),
            published_at   = excluded.published_at
    `).bind(
        report.report_date,
        report.title,
        report.summary || null,
        report.r2_key,
        report.podcast_r2_key || null,
        now
    ).run();
}

/**
 * 查询单条日报元数据
 *
 * @param {D1Database} db
 * @param {string} reportDate - YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
export async function getDailyReport(db, reportDate) {
    const result = await db.prepare(
        'SELECT * FROM daily_reports WHERE report_date = ?'
    ).bind(reportDate).first();
    return result || null;
}

/**
 * 查询最近 N 条日报元数据（用于 RSS/首页列表）
 *
 * @param {D1Database} db
 * @param {number} [limit=30]
 * @returns {Promise<Array<object>>}
 */
export async function listRecentReports(db, limit = 30) {
    const result = await db.prepare(
        'SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT ?'
    ).bind(limit).all();
    return result.results || [];
}

/**
 * 插入或更新 RSS 条目
 *
 * @param {D1Database} db
 * @param {{report_date: string, title: string, link: string, content_markdown: string}} item
 */
export async function upsertRssItem(db, item) {
    const now = new Date().toISOString();
    await db.prepare(`
        INSERT INTO rss_items (report_date, title, link, content_markdown, published_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(report_date) DO UPDATE SET
            title            = excluded.title,
            link             = excluded.link,
            content_markdown = excluded.content_markdown,
            published_at     = excluded.published_at
    `).bind(
        item.report_date,
        item.title,
        item.link,
        item.content_markdown,
        now
    ).run();
}

/**
 * 查询最近 N 条 RSS 条目
 *
 * @param {D1Database} db
 * @param {number} [limit=30]
 * @returns {Promise<Array<object>>}
 */
export async function listRecentRssItems(db, limit = 30) {
    const result = await db.prepare(
        'SELECT * FROM rss_items ORDER BY report_date DESC LIMIT ?'
    ).bind(limit).all();
    return result.results || [];
}
