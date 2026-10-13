// src/r2storage.js
// ============================================================
// Cloudflare KV 存储模块（替代 R2）
// 替代原 GitHub 文件提交功能（commitToGitHub.js / github.js）
// 将日报/播客内容存储到 KV，实现零外部平台依赖
// ============================================================

/**
 * 将内容写入 KV（新建或覆盖）
 *
 * @param {KVNamespace} kv - KV binding（env.DATA_KV）
 * @param {string} key - 对象键，如 "daily/2026-10-13.md"
 * @param {string} content - 文本内容
 * @param {string} [contentType="text/markdown; charset=utf-8"] - MIME 类型（保留参数，未使用）
 * @returns {Promise<void>}
 */
export async function storeInR2(kv, key, content, contentType = 'text/markdown; charset=utf-8') {
    console.log(`[KV] Storing object: ${key}`);
    await kv.put(key, content);
    console.log(`[KV] Stored: ${key}`);
}

/**
 * 从 KV 读取文本内容
 *
 * @param {KVNamespace} kv - KV binding
 * @param {string} key - 对象键
 * @returns {Promise<string|null>} 文本内容，不存在时返回 null
 */
export async function getFromR2(kv, key) {
    console.log(`[KV] Getting object: ${key}`);
    const value = await kv.get(key);
    if (!value) {
        console.log(`[KV] Object not found: ${key}`);
        return null;
    }
    console.log(`[KV] Retrieved: ${key} (${value.length} chars)`);
    return value;
}

/**
 * 检查 KV 中是否存在某个对象（兼容原 getGitHubFileSha 语义）
 *
 * @param {KVNamespace} kv - KV binding
 * @param {string} key - 对象键
 * @returns {Promise<boolean>} 是否存在
 */
export async function existsInR2(kv, key) {
    const value = await kv.get(key);
    return value !== null;
}

/**
 * 列出 KV 中某前缀下的所有对象
 *
 * @param {KVNamespace} kv - KV binding
 * @param {string} prefix - 前缀，如 "daily/"
 * @returns {Promise<Array<{key: string, size: number, uploaded: Date}>>}
 */
export async function listFromR2(kv, prefix) {
    const list = await kv.list({ prefix });
    const results = [];
    for (const entry of list.keys) {
        const value = await kv.get(entry.name);
        results.push({
            key: entry.name,
            size: value ? value.length : 0,
            uploaded: entry.createdAt ? new Date(entry.createdAt) : null,
        });
    }
    return results;
}

/**
 * 删除 KV 中的对象
 *
 * @param {KVNamespace} kv - KV binding
 * @param {string} key - 对象键
 * @returns {Promise<void>}
 */
export async function deleteFromR2(kv, key) {
    await kv.delete(key);
    console.log(`[KV] Deleted: ${key}`);
}

/**
 * 从 KV 返回一个可供 HTTP 响应的 Response 对象（用于公开 CDN 访问）
 *
 * @param {KVNamespace} kv - KV binding
 * @param {string} key - 对象键
 * @returns {Promise<Response>} HTTP Response，404 若不存在
 */
export async function serveFromR2(kv, key) {
    const value = await kv.get(key);
    if (!value) {
        return new Response('Not Found', { status: 404 });
    }
    const headers = new Headers();
    headers.set('Content-Type', 'text/markdown; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(value, { headers });
}
