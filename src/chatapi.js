// src/chatapi.js
// ============================================================
// Workers AI (Cloudflare) 完全替代 Gemini / OpenAI
// 使用 env.AI binding (Workers AI)
// ============================================================

/**
 * 调用 Cloudflare Workers AI（非流式）
 *
 * @param {object} env - 环境对象，包含 env.AI (Workers AI binding)
 * @param {string} promptText - 用户提示词
 * @param {string | null} [systemPromptText=null] - 可选系统提示词
 * @returns {Promise<string>} 生成的文本内容
 */
async function callWorkersAI(env, promptText, systemPromptText = null) {
    if (!env.AI) {
        throw new Error("Workers AI binding (env.AI) is not configured. Please add 'ai' binding in wrangler.toml.");
    }

    const modelName = env.DEFAULT_AI_MODEL || '@cf/meta/llama-3.1-70b-instruct';

    const messages = [];
    if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
        messages.push({ role: 'system', content: systemPromptText });
    }
    messages.push({ role: 'user', content: promptText });

    try {
        const response = await env.AI.run(modelName, {
            messages,
            max_tokens: 4096,
            temperature: 0.7,
        });

        // Workers AI 返回 { response: "..." } 格式
        if (response && response.response) {
            return response.response;
        }
        // 兼容部分模型返回数组格式
        if (Array.isArray(response) && response.length > 0) {
            return response[0].response || response[0].generated_text || '';
        }
        throw new Error('Workers AI returned an unexpected response format: ' + JSON.stringify(response));
    } catch (error) {
        console.error('Error calling Workers AI (non-streaming):', error);
        throw error;
    }
}

/**
 * 调用 Cloudflare Workers AI（流式）
 *
 * @param {object} env - 环境对象，包含 env.AI (Workers AI binding)
 * @param {string} promptText - 用户提示词
 * @param {string | null} [systemPromptText=null] - 可选系统提示词
 * @returns {AsyncGenerator<string>} 异步生成器，逐块 yield 文本
 */
async function* callWorkersAIStream(env, promptText, systemPromptText = null) {
    if (!env.AI) {
        throw new Error("Workers AI binding (env.AI) is not configured. Please add 'ai' binding in wrangler.toml.");
    }

    const modelName = env.DEFAULT_AI_MODEL || '@cf/meta/llama-3.1-70b-instruct';

    const messages = [];
    if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
        messages.push({ role: 'system', content: systemPromptText });
    }
    messages.push({ role: 'user', content: promptText });

    try {
        const stream = await env.AI.run(modelName, {
            messages,
            max_tokens: 4096,
            temperature: 0.7,
            stream: true,
        });

        // Workers AI 流式返回标准 SSE 格式
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let hasYieldedContent = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // 按照 SSE 格式解析 data: {...}\n\n
            let boundary;
            while ((boundary = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 1);

                if (!line || line === '' ) continue;

                if (line.startsWith('data: ')) {
                    const data = line.substring(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        // Workers AI SSE: { response: "chunk" }
                        if (parsed.response) {
                            hasYieldedContent = true;
                            yield parsed.response;
                        }
                    } catch (e) {
                        // 忽略非 JSON 行
                    }
                }
            }
        }

        // 处理缓冲区剩余内容
        if (buffer.trim()) {
            const line = buffer.trim();
            if (line.startsWith('data: ')) {
                const data = line.substring(6).trim();
                if (data && data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.response) {
                            hasYieldedContent = true;
                            yield parsed.response;
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }

        if (!hasYieldedContent) {
            throw new Error('Workers AI stream completed without yielding any content.');
        }

    } catch (error) {
        console.error('Error calling Workers AI (streaming):', error);
        throw error;
    }
}

/**
 * 主要调用入口 - 调用 Workers AI（非流式）
 *
 * @param {object} env - 环境对象
 * @param {string} promptText - 用户提示词
 * @param {string | null} [systemPromptText=null] - 可选系统提示词
 * @returns {Promise<string>} 生成的文本内容
 */
export async function callChatAPI(env, promptText, systemPromptText = null) {
    return callWorkersAI(env, promptText, systemPromptText);
}

/**
 * 主要调用入口 - 调用 Workers AI（流式）
 *
 * @param {object} env - 环境对象
 * @param {string} promptText - 用户提示词
 * @param {string | null} [systemPromptText=null] - 可选系统提示词
 * @returns {AsyncGenerator<string>} 异步生成器，逐块 yield 文本
 */
export async function* callChatAPIStream(env, promptText, systemPromptText = null) {
    yield* callWorkersAIStream(env, promptText, systemPromptText);
}

/**
 * 带有超时功能的 fetch 封装
 * @param {string} resource fetch 的请求 URL
 * @param {object} options fetch 的配置对象
 * @param {number} timeout 超时时间，单位毫秒
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(resource, options = {}, timeout = 180000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    } finally {
        clearTimeout(id);
    }
}