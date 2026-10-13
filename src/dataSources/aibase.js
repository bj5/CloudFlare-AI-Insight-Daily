// src/dataSources/aibase.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const NewsDataSource = {
    type: 'aibase',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            feedId: env.AIBASE_FEED_ID,
            fetchPages: parseInt(env.AIBASE_FETCH_PAGES || '3', 10),
            sourceTitle: 'AI Base',
            foloCookie,
            formatSource: () => 'aibase',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, 'AI Base');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '阅读更多');
    }
};

export default NewsDataSource;
