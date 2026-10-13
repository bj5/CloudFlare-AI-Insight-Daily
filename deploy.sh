#!/usr/bin/env bash
# deploy.sh — 一键创建 CF 资源并部署
# 用法：bash deploy.sh
set -e

export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
cd "$(dirname "$0")"

echo "========== Step 1: 创建 KV Namespace =========="
KV_OUTPUT=$(wrangler kv namespace create DATA_KV 2>&1)
echo "$KV_OUTPUT"
KV_ID=$(echo "$KV_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | sed 's/"id": "//;s/"//')
if [ -z "$KV_ID" ]; then
  # 如果已存在，尝试 list 获取 id
  KV_ID=$(wrangler kv namespace list 2>&1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
for ns in data:
    if ns.get('title') == 'ai-daily-DATA_KV':
        print(ns['id'])
        break
" 2>/dev/null || true)
fi
echo "KV ID: $KV_ID"

echo ""
echo "========== Step 2: 创建 D1 数据库 =========="
D1_OUTPUT=$(wrangler d1 create ai-daily-db 2>&1)
echo "$D1_OUTPUT"
D1_ID=$(echo "$D1_OUTPUT" | grep -o 'database_id = "[^"]*"' | head -1 | sed 's/database_id = "//;s/"//')
if [ -z "$D1_ID" ]; then
  D1_ID=$(wrangler d1 list 2>&1 | grep "ai-daily-db" | awk '{print $NF}' | head -1 || true)
fi
echo "D1 ID: $D1_ID"

echo ""
echo "========== Step 3: 初始化 D1 Schema =========="
wrangler d1 execute ai-daily-db --file=./schema.sql 2>&1 || echo "[WARN] Schema may already exist"

echo ""
echo "========== Step 4: 创建 R2 Bucket =========="
wrangler r2 bucket create ai-daily-bucket 2>&1 || echo "[WARN] Bucket may already exist"

echo ""
echo "========== Step 5: 更新 wrangler.toml =========="
if [ -n "$KV_ID" ]; then
  sed -i.bak "s/请替换为你的KV_ID/$KV_ID/g" wrangler.toml
  echo "Updated KV ID in wrangler.toml: $KV_ID"
fi
if [ -n "$D1_ID" ]; then
  sed -i.bak "s/请替换为你的D1_DATABASE_ID/$D1_ID/g" wrangler.toml
  echo "Updated D1 ID in wrangler.toml: $D1_ID"
fi

echo ""
echo "========== Step 6: 设置 Secrets =========="
echo "toor" | wrangler secret put LOGIN_PASSWORD 2>&1

echo ""
echo "========== Step 7: 部署 Worker =========="
wrangler deploy 2>&1

echo ""
echo "========== 部署完成 =========="
wrangler deployments list 2>&1 | head -20
