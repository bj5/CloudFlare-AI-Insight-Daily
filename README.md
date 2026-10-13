# 🚀 AI 资讯日报 (Cloudflare AI Insight Daily)

> 全栈 Cloudflare 生态托管 · 零服务器 · 零外部平台依赖 · 深度集成 RSSNext/Folo

**AI 资讯日报** 是基于 **Cloudflare Workers** 驱动的 AI 领域内容聚合与智能分析生成平台。系统每日自动抓取前沿 AI 资讯（包括行业动态、GitHub Trending 热门开源项目、ArXiv / HuggingFace 学术论文、科技推文与社区讨论），通过 **Cloudflare Workers AI (LLaMA 3.3 70B)** 进行自动化摘要生成、深度趋势分析以及中短版播客电台文案制作。

---

## 🌟 核心特性

- ⚡️ **100% Cloudflare 原生 Serverless**：无自建服务器、无 Docker 容器、无 GitHub Actions 依赖。
- 🤖 **免费强大的 Workers AI 推理**：默认搭载 `@cf/meta/llama-3.3-70b-instruct`，无需购买或配置任何 OpenAI / Gemini 付费 API Key。
- 📰 **全面对齐 [RSSNext/Folo](https://github.com/RSSNext/Folo) 最新协议**：
  - 针对 `https://app.folo.is` 最新 Web 客户端标准全面重构，支持 `x-app-name`、`x-app-version` 与现代 Client Hints 指纹；
  - 模块化设计统一客户端 [`foloClient`](./src/foloClient.js)，自动处理 Token 规整化、分页翻页与请求避频；
  - 支持在后台网页端一键持久化 Cookie 到云端 KV，让每日 Cron 定时自动化任务无感复用凭据。
- 🎙️ **多形态内容衍生**：除标准日报 Markdown 外，还可一键生成适于朗读录音的**长短版播客脚本**与**深度趋势洞察报告**。
- 📡 **标准 RSS 2.0 分发**：结构化元数据托管于 **Cloudflare D1 (SQLite)**，对外提供毫秒级响应的 `/rss` 聚合订阅。
- 🔒 **简易权限保护**：内置轻量 Session 机制，管理面板与数据抓取接口全方位防护。

---

## 🏗️ 架构拓扑

```
[Cron Triggers 每日 10:00] ──┐
                            ├──> [Workers 业务逻辑] ──> [Workers AI 推理 (LLaMA 3.3)]
[Web 管理端 /getContentHtml] ──┘         │
                                         ├──> [KV: 会话 / 缓存 / Markdown 持久化]
                                         ├──> [D1: 结构化元数据 & RSS 索引]
                                         └──> [RSS Feed: /rss & 静态直链 /r2/]
```

| 模块 / 资源 | 角色与用途 | 优势 |
| :--- | :--- | :--- |
| **Cloudflare Workers** | HTTP 路由路由、API 转发与业务流水线编排 | 毫秒级冷启动、全球边缘就近处理 |
| **Workers AI** | 负责新闻归纳、多语言翻译、摘要提取与播客稿生成 | 免 Key 成本、免去外部网络跳数延迟 |
| **Cloudflare KV** | 存储 Session 状态、Folo 认证凭据、原始快照及日报全文 | 高并发读性能、全局低延迟 |
| **Cloudflare D1** | 存储日报元数据表与 RSS 条目数据 | 标准 SQL 语法、轻量高效、便于复杂关联查询 |
| **Cron Triggers** | 每日北京时间 10:00 (UTC 02:00) 自动触发数据拉取 | 无需外部定时 Runner，全内置调度 |

---

## 🚀 快速开始

### 1. 准备环境与安装依赖

克隆本仓库并在项目根目录下安装依赖：

```bash
npm install
```

### 2. 创建 Cloudflare 资源

确保已安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) 并登录你的 Cloudflare 账户：

```bash
# 1. 创建 KV 命名空间（记录输出的 ID）
wrangler kv namespace create DATA_KV

# 2. 创建 D1 数据库（记录输出的 database_id）
wrangler d1 create ai-daily-db

# 3. 初始化 D1 数据表结构
wrangler d1 execute ai-daily-db --file=./schema.sql

# 4. 设置后台管理员登录密码
wrangler secret put LOGIN_PASSWORD
```

### 3. 配置 `wrangler.toml`

将步骤 2 中生成的 `id` 与 `database_id` 填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "DATA_KV"
id = "<你的 KV_ID>"

[[d1_databases]]
binding = "DB"
database_name = "ai-daily-db"
database_id = "<你的 D1_DATABASE_ID>"
```

### 4. 部署上线

```bash
# 本地预览测试
wrangler dev

# 生产发布
wrangler deploy
```

> 💡 也可以直接运行一键部署脚本：`bash deploy.sh`。

---

## 🔑 Folo / Follow 数据源配置说明

本项目深度整合 **[Folo](https://app.folo.is)** 作为核心资讯源。

### 1. 获取 Folo 订阅列表 ID
登录 [https://app.folo.is](https://app.folo.is)，找到你想订阅的分类或列表（如新闻聚合、论文、社交动态），从 URL 中获取 List ID，填入 `wrangler.toml` 的对应变量中：
- `NEWS_AGGREGATOR_LIST_ID`：新闻资讯列表 ID
- `HGPAPERS_LIST_ID`：前沿论文列表 ID
- `TWITTER_LIST_ID`：科技推特列表 ID
- `REDDIT_LIST_ID`：社区热帖列表 ID

### 2. 获取与保存 Folo Cookie（两种方式任选）

#### 方式 A：通过 Web 管理面板一键保存（推荐）
1. 访问部署后的管理页面：`https://<你的 Worker 域名>/getContentHtml`；
2. 登录后在页面顶部的 **Folo Cookie** 输入框中，粘贴从 `app.folo.is` 浏览器 DevTools Network 面板中复制的 Cookie（或 `authjs.session-token`）；
3. 点击 **保存 Cookie**：系统会自动保存至当前浏览器，并通过 `/saveFoloCookie` 接口同步持久化至云端 KV，**后台每日定时任务将自动复用该凭据**。

#### 方式 B：通过 Wrangler 命令行设置 Secret
```bash
wrangler secret put FOLO_COOKIE
```

---

## 🌐 路由与接口索引

| 路径 | 请求方法 | 权限 | 说明 |
| :--- | :---: | :---: | :--- |
| `/login` / `/logout` | `GET / POST` | 公开 | 后台管理员登录与登出 |
| `/getContentHtml` | `GET` | 需登录 | 日报管理控制台（查看数据、勾选条目、生成日报） |
| `/getContent` | `GET` | 公开 | 获取指定日期的各源原始 JSON 缓存 |
| `/writeData` | `POST` | 需登录 | 手动触发全量或指定分类的数据采集 |
| `/saveFoloCookie` | `POST` | 需登录 | 将最新 Folo Cookie 保存同步至 Worker KV |
| `/genAIContent` | `POST` | 需登录 | 调用 Workers AI 流式生成结构化日报 Markdown |
| `/genAIPodcastScript`| `POST` | 需登录 | 生成适合朗读的完整版与短版播客文案 |
| `/genAIDailyAnalysis`| `POST` | 需登录 | 生成当日科技动态深度趋势洞察 |
| `/rss` | `GET` | 公开 | 获取聚合 RSS 2.0 Feed（支持 `?days=7` 参数） |
| `/r2/daily/{date}.md`| `GET` | 公开 | 直接读取已发布的当日日报原始 Markdown 文件 |

---

## 🤖 Workers AI 模型切换

系统默认使用能力最强的 `@cf/meta/llama-3.3-70b-instruct`。如需切换，可在 `wrangler.toml` 的 `DEFAULT_AI_MODEL` 中更改：

| 模型代号 | 特点 | 推荐场景 |
| :--- | :--- | :--- |
| `@cf/meta/llama-3.3-70b-instruct` | **最强综合能力**，中文表达流畅细腻 | **默认推荐**，生产首选 |
| `@cf/qwen/qwen2.5-72b-instruct` | 中文原生，长文本理解力优秀 | 中文专业术语密集场景 |
| `@cf/meta/llama-3.1-70b-instruct` | 响应速度与表现均衡 | 日常内容生成 |
| `@cf/mistral/mistral-7b-instruct-v0.2` | 极速轻量，资源消耗低 | 快速测试与简单提炼 |

---

## 📄 License

[Apache-2.0 License](./LICENSE)
