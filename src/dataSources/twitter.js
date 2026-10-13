// src/dataSources/twitter.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const TwitterDataSource = {
    type: 'twitter',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            listId: env.TWITTER_LIST_ID,
            fetchPages: parseInt(env.TWITTER_FETCH_PAGES || '1', 10),
            sourceTitle: 'Twitter/X 资讯',
            foloCookie,
            formatSource: (entry) => {
                const author = entry.entries?.author;
                const feedTitle = entry.feeds?.title;
                if (feedTitle && feedTitle.startsWith('Twitter')) {
                    return `twitter-${author || 'post'}`;
                }
                return feedTitle ? `${feedTitle} - ${author || ''}` : `twitter-${author || 'post'}`;
            },
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, 'Twitter');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '查看推文');
    }
};

export default TwitterDataSource;
