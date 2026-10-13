// src/dataSources/reddit.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const RedditDataSource = {
    type: 'reddit',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            listId: env.REDDIT_LIST_ID,
            fetchPages: parseInt(env.REDDIT_FETCH_PAGES || '1', 10),
            sourceTitle: 'Reddit 社区',
            foloCookie,
            formatSource: (entry) => entry.feeds?.title || 'Reddit',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, 'Reddit');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '查看 Reddit 帖子');
    }
};

export default RedditDataSource;
