window['@algolia/recommend-templates-products'] = {

    ////////////////////
    //  Template API  //
    ////////////////////
    getHeaderHtml: function ({html, title, recommendations}) {
        if (!recommendations || !recommendations.length) {
            return "";
        }
        return html`<h3 class="auc-Recommend-title">${title}</h3>`;
    },

    getItemHtml: function ({item, html, addToCartEnabled}) {
        this.defaultIndexName = algoliaConfig.indexName + '_products';
        return html`<div class="flex flex-col w-full h-full bg-white shadow"
                         itemprop="itemListElement" itemscope itemtype="http://schema.org/ListItem"
                         x-init="bindClickEvent($el, 'Product Clicked', '${item.objectID}', '${this.defaultIndexName}', '${item.position}')">
            <div class="flex-grow">
                <a class="recommend-item product-url h-full result"
                       href="${item.url}">
                    <div class="h-full flex flex-col p-4 hover:bg-gray-100">
                        <div class="flex justify-center items-center mb-3 bg-white thumb">
                            <img src="${item.image_url || ''}" alt="${item.name || ''}"/>
                        </div>
                        <div class="flex flex-col items-stretch flex-grow info">
                            <h3 itemprop="name" class="mt-2 mb-1 items-center justify-center text-primary font-semibold text-lg text-center">
                                ${item.name}
                            </h3>

                            ${this.getPricingHtml(item, html)}
                            ${this.getAddtoCartHtml(item, html, addToCartEnabled)}
                        </div>
                    </div>
                </a>
            </div>
        </div>`;
    },

    ////////////////////
    // Helper methods //
    ////////////////////

    getOriginalPriceHtml: (item, html, priceGroup) => {
        if (item['price'][algoliaConfig.currencyCode][priceGroup + '_original_formated'] == null) return "";

        return html`<span
            class="before_special text-base font-normal leading-6 text-gray-500"> ${item['price'][algoliaConfig.currencyCode][priceGroup + '_original_formated']} </span>`;
    },

    getTierPriceHtml: (item, html, priceGroup) => {
        if (item['price'][algoliaConfig.currencyCode][priceGroup + '_tier_formated'] == null) return "";

        return html`<span class="tier_price"> As low as <span
            class="tier_value">${item['price'][algoliaConfig.currencyCode][priceGroup + '_tier_formated']}</span></span>`;
    },

    getPricingHtml: function (item, html) {
        if (item['price'] === undefined) return "";

        const priceGroup = algoliaConfig.priceGroup || 'default';

        return html`
            <div className="algoliasearch-autocomplete-price flex flex-col">
                <span
                    className="text-lg font-semibold tracking-wider leading-7 after_special ${item['price'][algoliaConfig.currencyCode][priceGroup + '_original_formated'] != null ? 'promotion' : ''}">
                    ${item['price'][algoliaConfig.currencyCode][priceGroup + '_formated']}
                </span>
                ${this.getOriginalPriceHtml(item, html, priceGroup)}

                ${this.getTierPriceHtml(item, html, priceGroup)}
            </div>`;
    },
    getAddtoCartHtml: function (item, html, addToCartEnabled) {
        if (!addToCartEnabled) return "";

        let correctFKey = hyva.getCookie('form_key');
        if (correctFKey !== "" && algoliaConfig.recommend.addToCartParams.formKey !== correctFKey) {
            algoliaConfig.recommend.addToCartParams.formKey = correctFKey;
        }
        let action = algoliaConfig.recommend.addToCartParams.action + 'product/' + item.objectID + '/';
        return html`
            <div class="mt-auto pt-3 flex flex-wrap justify-center items-center">
                <form class="addTocartForm flex-grow" action="${action}" method="post"
                      data-role="tocart-form">
                    <input type="hidden" name="form_key"
                           value="${algoliaConfig.recommend.addToCartParams.formKey}"/>
                    <input type="hidden" name="unec" value="${window.AlgoliaBase64.encode(action)}"/>
                    <input type="hidden" name="product" value="${item.objectID}"/>
                    <button type="submit" class="w-auto btn btn-primary justify-center text-sm mr-auto tocart">
                        <svg class="h-6 w-6 border-current inline" width="25" height="25" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                        </svg>
                        <span class="ml-2 inline md:ml-0 md:hidden lg:ml-2 lg:inline">${algoliaConfig.translations.addToCart}</span>
                    </button>
                </form>
                <button
                    x-data="initWishlist()"
                    x-on:click.prevent="addToWishlist(${item.objectID})"
                    class="rounded-full w-9 h-9 bg-gray-200 p-0 border-0 inline-flex flex-shrink-0 items-center justify-center text-gray-500 hover:text-red-600 ml-2"
                >
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="25" height="25">
                        <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"/>
                    </svg>
                </button>
                <button
                    x-data="initCompareOnProductView()"
                    x-on:click.prevent="addToCompare(${item.objectID})"
                    class="rounded-full w-9 h-9 bg-gray-200 p-0 border-0 inline-flex flex-shrink-0 items-center justify-center text-gray-500 hover:text-yellow-500 ml-2"
                >
                    <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 25 25" stroke-width="2" stroke="currentColor" width="25" height="25">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
                    </svg>
                </button>
            </div>`;
    },
};

