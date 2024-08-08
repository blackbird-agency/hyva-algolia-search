function initAlgoliaRecommendedTrends(containerValue, numOfTrendsItem, facetName, facetValue) {

    this.defaultIndexName = window.algoliaConfig.indexName + '_products';
    const recommend = window['@algolia/recommend'];
    const recommendJs = window['@algolia/recommend-js'];
    const {applicationId, apiKey} = window.algoliaConfig;
    const recommendClient = recommend(applicationId, apiKey);
    const indexName = this.defaultIndexName;
    const productsHtml = window['@algolia/recommend-templates-products'];

    const title = window.algoliaConfig.recommend.trendingItemsTitle;
    const addToCartEnabled = window.algoliaConfig.recommend.isAddToCartEnabledInTrendsItem;

    recommendJs.trendingItems({
        container:  "#" +containerValue,
        facetName: facetName ? facetName : '',
        facetValue: facetValue ? facetValue : '',
        recommendClient,
        indexName,
        maxRecommendations: numOfTrendsItem ? parseInt(numOfTrendsItem) : window.algoliaConfig.recommend.limitTrendingItems,
        transformItems: function (items) {
            return items.map((item, index) => ({
                ...item,
                position: index + 1,
            }));
        },
        headerComponent({html, recommendations}) {
            return productsHtml.getHeaderHtml({html, title, recommendations});
        },
        itemComponent({item, html}) {
            return productsHtml.getItemHtml({item, html, addToCartEnabled});
        },
    });
}
