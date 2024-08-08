window['@algolia/templates-pages'] = {
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
                <a class="algoliasearch-autocomplete-hit"
                   href="${item.url}">
                    <div class="info-without-thumb">
                        ${this.safeHighlight(components, item, "name")}
                        <div class="details">
                            ${this.safeHighlight(components, item, "content")}
                        </div>
                    </div>
                    <div class="algolia-clearfix"></div>
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

