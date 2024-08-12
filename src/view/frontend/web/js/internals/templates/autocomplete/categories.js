window['@algolia/templates-categories'] = {
    getNoResultHtml: function ({html}) {
        return html`<p>${algoliaConfig.translations.noResults}</p>`;
    },

    getHeaderHtml: function ({section}) {
        return section.label;
    },

    getItemHtml: function ({item, components, html}) {
        return html`
            <div
                x-init="bindClickEvent($el, 'Product Clicked', '${item.objectID}', '${item.__autocomplete_indexName}', '${item.position}',  '${item.__autocomplete_queryID}')">
                <a class="algoliasearch-autocomplete-hit" href="${item.url}">
                    ${this.safeHighlight(components, item, "path")} (${item.product_count})
                </a></div>`;
    },

    getFooterHtml: function () {
        return "";
    },

    safeHighlight: function(components, hit, attribute) {
        const highlightResult = hit._highlightResult[attribute];

        if (!highlightResult) return '';

        try {
            return components.Highlight({ hit, attribute });
        } catch (e) {
            return '';
        }
    }
};
