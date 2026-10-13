// src/dataSources/papers.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const PapersDataSource = {
    type: 'papers',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            listId: env.HGPAPERS_LIST_ID,
            fetchPages: parseInt(env.HGPAPERS_FETCH_PAGES || '1', 10),
            sourceTitle: '学术论文',
            foloCookie,
            formatSource: (entry) => entry.feeds?.title || 'HuggingFace Papers',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, '学术论文');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '在 ArXiv/来源 阅读');
    }
};

export default PapersDataSource;