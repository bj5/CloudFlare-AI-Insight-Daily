// src/dataSources/xiaohu.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const XiaohuDataSource = {
    type: 'xiaohu',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            feedId: env.XIAOHU_FEED_ID,
            fetchPages: parseInt(env.XIAOHU_FETCH_PAGES || '3', 10),
            sourceTitle: 'Xiaohu.AI',
            foloCookie,
            formatSource: () => 'xiaohu.ai',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, 'Xiaohu.AI');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '阅读更多');
    }
};

export default XiaohuDataSource;
