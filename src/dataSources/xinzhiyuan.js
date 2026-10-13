// src/dataSources/xinzhiyuan.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const XinZhiYuanDataSource = {
    type: 'xinzhiyuan',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            feedId: env.XINZHIYUAN_FEED_ID,
            fetchPages: parseInt(env.XINZHIYUAN_FETCH_PAGES || '3', 10),
            sourceTitle: '新智元',
            foloCookie,
            formatSource: () => 'xinzhiyuan.ai',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, '新智元');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '阅读更多');
    }
};

export default XinZhiYuanDataSource;
