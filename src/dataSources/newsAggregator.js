// src/dataSources/newsAggregator.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const NewsAggregatorDataSource = {
    type: 'news-aggregator',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            listId: env.NEWS_AGGREGATOR_LIST_ID,
            fetchPages: parseInt(env.NEWS_AGGREGATOR_FETCH_PAGES || '1', 10),
            sourceTitle: '新闻聚合',
            foloCookie,
            formatSource: (entry) => {
                const author = entry.entries?.author;
                const feedTitle = entry.feeds?.title;
                return author ? `${feedTitle} - ${author}` : feedTitle;
            },
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, '新闻聚合');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '阅读更多');
    }
};

export default NewsAggregatorDataSource;
