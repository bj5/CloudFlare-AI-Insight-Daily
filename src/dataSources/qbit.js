// src/dataSources/qbit.js
import { fetchFoloEntries, transformFoloFeed, generateFoloHtml } from '../foloClient.js';

const QBitDataSource = {
    type: 'qbit',

    async fetch(env, foloCookie) {
        return await fetchFoloEntries(env, {
            feedId: env.QBIT_FEED_ID,
            fetchPages: parseInt(env.QBIT_FETCH_PAGES || '3', 10),
            sourceTitle: 'QBit.AI',
            foloCookie,
            formatSource: () => 'qbit.ai',
        });
    },

    transform(rawData, sourceType) {
        return transformFoloFeed(rawData, sourceType, 'QBit.AI');
    },

    generateHtml(item) {
        return generateFoloHtml(item, '阅读更多');
    }
};

export default QBitDataSource;
