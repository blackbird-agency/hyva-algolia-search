window['@algolia/templates-additional-section'] = {
    getNoResultHtml: function ({html}) {
        return html`<p>${algoliaConfig.translations.noResults}</p>`;
    },

    getHeaderHtml: function ({section}) {
        return section.label || section.name;
    },

    getItemHtml: function ({item, components, html, section}) {
        return html`
            <div
                x-init="bindClickEvent($el, 'Product Clicked', '${item.objectID}', '${item.__autocomplete_indexName}', '${item.position}',  '${item.__autocomplete_queryID}')">
                <a class="aa-ItemLink"
                   href="${algoliaConfig.resultPageUrl}?q=${encodeURIComponent(item.query)}&${section.name}=${encodeURIComponent(item.value)}"
                >
                    ${components.Highlight({hit: item, attribute: 'value'})}
                </a></div>`;

    },

    getFooterHtml: function () {
        return "";
    }
};
