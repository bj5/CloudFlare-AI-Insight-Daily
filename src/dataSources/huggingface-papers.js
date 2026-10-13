// src/dataSources/huggingface-papers.js
import { stripHtml, removeMarkdownCodeBlock, formatDateToChineseWithTime, escapeHtml } from '../helpers.js';
import { callChatAPI } from '../chatapi.js';
import { fetchFoloEntries } from '../foloClient.js';

const PapersDataSource = {
    fetch: async (env, foloCookie) => {
        const feedId = env.HGPAPERS_FEED_ID;
        const fetchPages = parseInt(env.HGPAPERS_FETCH_PAGES || '3', 10);

        const papersData = await fetchFoloEntries(env, {
            feedId,
            fetchPages,
            sourceTitle: 'Huggingface Daily Papers',
            foloCookie,
            formatSource: () => 'huggingface-papers',
        });

        if (!papersData || papersData.items.length === 0) {
            return papersData;
        }

        if (env.OPEN_TRANSLATE !== "true") {
            papersData.items = papersData.items.map(item => ({
                ...item,
                title_zh: item.title || "",
                content_html_zh: item.content_html || ""
            }));
            return papersData;
        }

        const itemsToTranslate = papersData.items.map((item, index) => ({
            id: index,
            original_title: item.title || ""
        }));

        const hasContentToTranslate = itemsToTranslate.some(item => item.original_title.trim() !== "");
        if (!hasContentToTranslate) {
            papersData.items = papersData.items.map(item => ({ ...item, title_zh: item.title || "", content_html_zh: item.content_html || "" }));
            return papersData;
        }

        const promptText = `You will be given a JSON array of paper data objects. Each object has an "id" and "original_title".
Translate "original_title" into Chinese.
Return a JSON array of objects. Each output object MUST have:
- "id": The same id from the input.
- "title_zh": Chinese translation of "original_title". Empty if original is empty.
Input: ${JSON.stringify(itemsToTranslate)}
Respond ONLY with the JSON array.`;

        let translatedItemsMap = new Map();
        try {
            console.log(`Requesting translation for ${itemsToTranslate.length} hgpapers titles.`);
            const chatResponse = await callChatAPI(env, promptText);
            const parsedTranslations = JSON.parse(removeMarkdownCodeBlock(chatResponse));

            if (parsedTranslations && Array.isArray(parsedTranslations)) {
                parsedTranslations.forEach(translatedItem => {
                    if (translatedItem && typeof translatedItem.id === 'number' && typeof translatedItem.title_zh === 'string') {
                        translatedItemsMap.set(translatedItem.id, translatedItem);
                    }
                });
            }
        } catch (translationError) {
            console.error("Failed to translate hgpapers titles in batch:", translationError.message);
        }

        papersData.items = papersData.items.map((originalItem, index) => {
            const translatedData = translatedItemsMap.get(index);
            return {
                ...originalItem,
                title_zh: translatedData ? translatedData.title_zh : (originalItem.title || "")
            };
        });

        return papersData;
    },

    transform: (papersData, sourceType) => {
        const unifiedPapers = [];
        if (papersData && Array.isArray(papersData.items)) {
            papersData.items.forEach((item) => {
                unifiedPapers.push({
                    id: item.id,
                    type: sourceType,
                    url: item.url,
                    title: item.title_zh || item.title,
                    description: stripHtml(item.content_html || ""),
                    published_date: item.date_published,
                    authors: typeof item.authors === 'string' ? item.authors.split(',').map(s => s.trim()) : (item.authors ? item.authors.map(a => a.name) : []),
                    source: item.source || "Huggingface Papers",
                    details: {
                        content_html: item.content_html || ""
                    }
                });
            });
        }
        return unifiedPapers;
    },

    generateHtml: (item) => {
        return `
            <strong>${escapeHtml(item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">
                 ${item.details.content_html || '无内容。'}<hr>
            </div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">在 ArXiv/来源 阅读</a>
        `;
    }
};

export default PapersDataSource;
