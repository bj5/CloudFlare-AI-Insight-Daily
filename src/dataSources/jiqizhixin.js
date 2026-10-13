// src/dataSources/jiqizhixin.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const JiqizhixinDataSource = {
    type: 'jiqizhixin',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            feedId: env.JIQIZHIXIN_FEED_ID,
            fetchPages: parseInt(env.JIQIZHIXIN_FETCH_PAGES || '3', 10),
            sourceTitle: '机器之心',
            foloCookie,
            formatSource: () => 'jiqizhixin.ai',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, '机器之心');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '阅读更多');
    }
};

export default JiqizhixinDataSource;
