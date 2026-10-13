# 🚀 AI 资讯日报 — 全栈 Cloudflare 架构部署指南

> 零服务器 · 零外部平台 · 100% Cloudflare 生态

## 架构概览

```
┌────────────────────────────────────────────────────────────┐
│                    Cloudflare 生态全景                       │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  Workers     │  Workers AI  │  KV          │  D1           │
│  (业务逻辑)  │  (AI 推理)  │  (缓存/会话) │  (结构化数据) │
├──────────────┴──────────────┴──────────────┴───────────────┤
│                          R2                                  │
│              (日报/播客 Markdown 文件存储)                   │
├────────────────────────────────────────────────────────────┤
│              Cron Triggers（每日自动抓取数据）               │
└────────────────────────────────────────────────────────────┘
```

### 迁移对照表

| 原组件                       | 新组件                              | 说明                                 |
| ---------------------------- | ----------------------------------- | ------------------------------------ |
| Google Gemini API            | **Workers AI** (`env.AI`)   | 零 API Key，按量计费（免费额度丰富） |
| OpenAI API                   | **Workers AI**                | 同上                                 |
| GitHub 文件存储              | **R2** (`env.DAILY_BUCKET`) | S3 兼容，零 Token                    |
| GitHub Actions / cron-docker | **Cron Triggers**             | Workers 内置调度，无需容器           |
| 无结构化查询                 | **D1** (`env.DB`)           | SQLite，支持 SQL 查询                |
| KV（数据缓存）               | **KV**                        | 保留，用于会话 + 快速缓存            |

---

## 快速部署（5 步）

### 前置要求

- 安装 [Node.js 18+](https://nodejs.org)
- 安装 Wrangler CLI：`npm install -g wrangler`
- 已登录 Cloudflare 账户：`wrangler login`

---

### Step 1：创建 KV Namespace

```bash
wrangler kv namespace create DATA_KV
```

复制输出的 `id`，填入 `wrangler.toml`：

```toml
kv_namespaces = [
  { binding = "DATA_KV", id = "你的KV_ID" }
]
```

---

### Step 2：创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create ai-daily-db

# 初始化表结构
wrangler d1 execute ai-daily-db --file=./schema.sql

# （可选）验证表结构
wrangler d1 execute ai-daily-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

复制输出的 `database_id`，填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding       = "DB"
database_name = "ai-daily-db"
database_id   = "你的D1_DATABASE_ID"
```

---

### Step 3：创建 R2 存储桶

```bash
wrangler r2 bucket create ai-daily-bucket
```

`wrangler.toml` 中已配置：

```toml
[[r2_buckets]]
binding     = "DAILY_BUCKET"
bucket_name = "ai-daily-bucket"
```

> **可选：配置公开访问**
> 在 Cloudflare 控制台 → R2 → ai-daily-bucket → Settings → Public Access 开启，
> 并绑定自定义域名（如 `files.yourdomain.com`），即可通过 CDN 直接访问 Markdown 文件。

---

### Step 4：设置敏感 Secrets

```bash
# 必须设置（登录密码）
wrangler secret put LOGIN_PASSWORD

# 如果使用 Follow.is / Folo 数据源
wrangler secret put FOLO_COOKIE
```

---

### Step 5：填写 wrangler.toml 并部署

编辑 `wrangler.toml`，填入上述步骤获得的 ID，然后：

```bash
# 本地开发调试
wrangler dev

# 部署到生产
wrangler deploy
```

---

## Workers AI 模型选择

在 `wrangler.toml` 中修改 `DEFAULT_AI_MODEL`：

| 模型                                     | 特点               | 推荐场景           |
| ---------------------------------------- | ------------------ | ------------------ |
| `@cf/meta/llama-3.3-70b-instruct`      | 最强中文能力       | **推荐默认** |
| `@cf/meta/llama-3.1-70b-instruct`      | 平衡能力/速度      | 日常使用           |
| `@cf/qwen/qwen2.5-72b-instruct`        | 中文原生，理解力强 | 中文内容生成       |
| `@cf/mistral/mistral-7b-instruct-v0.2` | 极速，轻量         | 摘要类短任务       |

> Workers AI 免费额度（每天）：
>
> - **Llama 3.3 70B**: 10,000 neurons/day
> - 所有模型无需 API Key，按 Workers AI 计费规则计算

---

## Cron Triggers 说明

在 `wrangler.toml` 中已配置：

```toml
[triggers]
crons = ["0 2 * * *"]   # UTC 02:00 = 北京时间 10:00
```

每日自动执行：

1. 从 Folo (app.folo.is) / GitHub Trending 等数据源抓取最新内容
2. 数据存入 KV（供 UI 选择和生成日报使用）

**后续步骤仍需手动触发**（登录后台选择条目 → 生成日报 → 存入 R2）：

- `/getContentHtml` — 查看今日数据
- `/genAIContent` — AI 生成日报
- `/commitToGitHub` — 存储到 R2（接口名保留以兼容前端）

---

## API 端点一览

| 端点                    | 方法     | 认证 | 说明                           |
| ----------------------- | -------- | ---- | ------------------------------ |
| `/login`              | GET/POST | ❌   | 登录页面                       |
| `/logout`             | GET      | ❌   | 退出登录                       |
| `/rss`                | GET      | ❌   | RSS Feed（从 KV 读取）         |
| `/getContent`         | GET      | ❌   | 获取原始数据                   |
| `/r2/{key}`           | GET      | ❌   | 直接访问 R2 中的文件           |
| `/generateRssContent` | GET      | ❌   | 生成 RSS AI 摘要（R2→AI→R2） |
| `/writeRssData`       | GET      | ❌   | RSS 数据写入 KV+D1             |
| `/getContentHtml`     | GET      | ✅   | 数据展示管理页面               |
| `/writeData`          | POST     | ✅   | 抓取数据写入 KV                |
| `/genAIContent`       | POST     | ✅   | Workers AI 生成日报            |
| `/genAIPodcastScript` | POST     | ✅   | 生成播客脚本                   |
| `/genAIDailyAnalysis` | POST     | ✅   | 生成每日分析                   |
| `/commitToGitHub`     | POST     | ✅   | 存储内容到 R2 + D1             |

---

## R2 文件结构

```
ai-daily-bucket/
├── daily/
│   ├── 2026-10-13.md   ← 日报 Markdown
│   ├── 2026-10-14.md
│   └── ...
├── podcast/
│   ├── 2026-10-13.md   ← 播客脚本
│   └── ...
└── rss/
    ├── 2026-10-13.md   ← RSS 精简摘要
    └── ...
```

通过 Worker 访问：`https://你的域名.workers.dev/r2/daily/2026-10-13.md`

---

## D1 数据库结构

```sql
-- 日报元数据
daily_reports (id, report_date, title, summary, r2_key, podcast_r2_key, published_at)

-- RSS 条目
rss_items (id, report_date, title, link, content_markdown, published_at)
```

---

## 常见问题

### Q: Workers AI 生成质量不如 Gemini？

A: 推荐使用 `@cf/meta/llama-3.3-70b-instruct` 或 `@cf/qwen/qwen2.5-72b-instruct`，
中文摘要生成质量接近 Gemini Pro。也可在 `wrangler.toml` 灵活切换模型。

### Q: R2 能做 CDN 加速吗？

A: 可以。在 Cloudflare 控制台 → R2 → Public Access → 绑定自定义域名，
即可通过 Cloudflare CDN 全球加速访问日报文件。

### Q: Cron 触发器执行失败怎么排查？

A: `wrangler tail` 实时查看日志，或在 Cloudflare 控制台 → Workers → Logs 查看历史。

### Q: D1 支持哪些 SQL？

A: D1 基于 SQLite，支持标准 SQLite SQL 语法，不支持存储过程和某些高级特性。

---

## 费用估算（每月）

| 服务       | 免费额度                   | 超出价格                                     |
| ---------- | -------------------------- | -------------------------------------------- |
| Workers    | 100,000 req/天             | $0.50/百万次                                 |
| Workers AI | 10,000 neurons/天          | $0.011/1K neurons                            |
| KV         | 100K 读/天, 1K 写/天       | $0.50/百万读                                 |
| D1         | 5M 行读/天, 100K 行写/天   | $0.001/百万行                                |
| R2         | 10 GB 存储, 1M A 类操作/月 | $0.015/GB/月项目，几乎完全在免费额度内运行。 |
