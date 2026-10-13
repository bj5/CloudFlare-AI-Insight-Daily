-- schema.sql
-- ============================================================
-- Cloudflare D1 数据库 Schema
-- 通过以下命令初始化：
--   wrangler d1 execute ai-daily-db --file=./schema.sql
-- ============================================================

-- 日报元数据表（每天一条记录）
CREATE TABLE IF NOT EXISTS daily_reports (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date    TEXT    NOT NULL UNIQUE,  -- YYYY-MM-DD
    title          TEXT    NOT NULL,
    summary        TEXT,                     -- AI 生成的今日摘要（纯文本，≤500字）
    r2_key         TEXT    NOT NULL,         -- R2 对象键: daily/YYYY-MM-DD.md
    podcast_r2_key TEXT,                     -- 播客脚本 R2 键: podcast/YYYY-MM-DD.md
    published_at   TEXT    NOT NULL          -- ISO 8601 时间戳
);

-- RSS 条目表（精简版摘要，用于 RSS Feed）
CREATE TABLE IF NOT EXISTS rss_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date      TEXT    NOT NULL UNIQUE,
    title            TEXT    NOT NULL,
    link             TEXT    NOT NULL,
    content_markdown TEXT    NOT NULL,
    published_at     TEXT    NOT NULL
);

-- 索引：按日期降序查询
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_date ON rss_items(report_date DESC);
