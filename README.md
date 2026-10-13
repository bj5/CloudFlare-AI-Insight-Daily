# 🚀 AI 资讯日报

> 全栈 Cloudflare 生态托管 · 零服务器 · 零外部平台依赖

**AI 资讯日报** 是基于 **Cloudflare Workers** 驱动的内容聚合与 AI 分析平台。每日精选 AI 领域最新动态，包括行业新闻、热门开源项目、前沿学术论文、科技大V社交媒体内容，通过 **Cloudflare Workers AI** 进行智能摘要生成，日报内容存储于 **Cloudflare R2**，元数据存于 **Cloudflare D1**。

## 架构特点

```
Workers (逻辑) → Workers AI (推理) → R2 (存储) → D1 (查询) → KV (缓存)
                    ↑
              Cron Triggers (每日自动抓取，替代 Docker Cron)
```

| 组件 | 用途 |
|------|------|
| **Cloudflare Workers** | HTTP 路由 / 业务逻辑 |
| **Workers AI** | AI 摘要/日报生成（替代 Gemini） |
| **KV** | 会话存储 / 原始数据缓存 |
| **D1** | 日报元数据 / RSS 结构化查询 |
| **R2** | 日报 / 播客 Markdown 文件（替代 GitHub 提交） |
| **Cron Triggers** | 每日自动数据抓取（替代 cron-docker） |

## 快速开始

详见 [📖 CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)

```bash
# 1. 创建资源
wrangler kv namespace create DATA_KV
wrangler d1 create ai-daily-db
wrangler d1 execute ai-daily-db --file=./schema.sql
wrangler r2 bucket create ai-daily-bucket

# 2. 设置密码
wrangler secret put LOGIN_PASSWORD

# 3. 填写 wrangler.toml 中的 ID，然后部署
wrangler deploy
```

## Workers AI 模型

默认使用 `@cf/meta/llama-3.3-70b-instruct`，无需任何 API Key。  
可在 `wrangler.toml` 中修改 `DEFAULT_AI_MODEL` 切换模型。
