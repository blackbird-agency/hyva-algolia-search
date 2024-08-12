function initAlgoliaInstantSearch() {
    selectors = {
        instantResultsWrapper: 'algolia-instant-results-wrapper',
        instant_selector: '#instant-search-bar'
    }

    /** We have nothing to do here if instantsearch is not enabled **/
    if (typeof algoliaConfig === 'undefined' || !algoliaConfig.instant.enabled || !(algoliaConfig.isSearchPage || !algoliaConfig.autocomplete.enabled)) {
        return;
    }

    if (document.querySelector(algoliaConfig.instant.selector).length <= 0) {
        throw '[Algolia] Invalid instant-search selector: ' + algoliaConfig.instant.selector;
    }

    /*if (algoliaConfig.autocomplete.enabled && $(algoliaConfig.instant.selector).find(algoliaConfig.autocomplete.selector).length > 0) {
            throw '[Algolia] You can\'t have a search input matching "' + algoliaConfig.autocomplete.selector +
            '" inside you instant selector "' + algoliaConfig.instant.selector + '"';
    }

    var findAutocomplete = algoliaConfig.autocomplete.enabled && $(algoliaConfig.instant.selector).find('#algolia-autocomplete-container').length > 0;
    if (findAutocomplete) {
            $(algoliaConfig.instant.selector).find('#algolia-autocomplete-container').remove();
    }*/

    /** BC of old hooks **/
    if (typeof algoliaHookBeforeInstantsearchInit === 'function') {
        algolia.registerHook('beforeInstantsearchInit', algoliaHookBeforeInstantsearchInit);
    }

    if (typeof algoliaHookBeforeWidgetInitialization === 'function') {
        algolia.registerHook('beforeWidgetInitialization', algoliaHookBeforeWidgetInitialization);
    }

    if (typeof algoliaHookBeforeInstantsearchStart === 'function') {
        algolia.registerHook('beforeInstantsearchStart', algoliaHookBeforeInstantsearchStart);
    }

    if (typeof algoliaHookAfterInstantsearchStart === 'function') {
        algolia.registerHook('afterInstantsearchStart', algoliaHookAfterInstantsearchStart);
    }

    /**
     * Setup wrapper
     *
     * For templating is used Hogan library
     * Docs: http://twitter.github.io/hogan.js/
     **/
    const wrapperTemplate = Hogan.compile(document.querySelector('#instant_wrapper_template').innerHTML);

    const div = document.createElement('div');
    div.setAttribute('id', selectors.instantResultsWrapper);

    document.querySelector(algoliaConfig.instant.selector).classList.add('algolia-instant-replaced-content');

    //wrap instantSelector
    const el = document.querySelector(algoliaConfig.instant.selector);
    let wrapperEl = document.createElement('div');
    wrapperEl.setAttribute("id", selectors.instantResultsWrapper);
    el.parentNode.insertBefore(wrapperEl, el);
    wrapperEl.appendChild(el);

    //render wrapper template with Hogan
    let wrapper = wrapperTemplate.render({
        second_bar: algoliaConfig.instant.enabled,
        config: algoliaConfig.instant,
        translations: algoliaConfig.translations
    });
    document.getElementById(selectors.instantResultsWrapper).innerHTML += '<div id="algolia-instant-selector-results">' + wrapper + '</div>';
    document.querySelector('#algolia-instant-selector-results').innerHTML = wrapper;
    document.getElementById(selectors.instantResultsWrapper).style.display = 'block';

    /**
     * Initialise instant search
     * For rendering instant search page is used Algolia's instantsearch.js library
     * Docs: https://www.algolia.com/doc/api-reference/widgets/instantsearch/js/
     **/

    const ruleContexts = ['magento_filters', '']; // Empty context to keep BC for already create rules in dashboard

    if (algoliaConfig.request.categoryId.length > 0) {
        ruleContexts.push('magento-category-' + algoliaConfig.request.categoryId);
    }

    if (algoliaConfig.request.landingPageId.length > 0) {
        ruleContexts.push('magento-landingpage-' + algoliaConfig.request.landingPageId);
    }

    const searchClient = algoliasearch(algoliaConfig.applicationId, algoliaConfig.apiKey);
    const indexName = algoliaConfig.indexName + '_products';
    let searchParameters = {
        hitsPerPage: algoliaConfig.hitsPerPage,
        ruleContexts: ruleContexts,
        // clickAnalytics: true
    };

    const replacedContent = document.querySelector('.algolia-instant-replaced-content');
    const instantSelectorResults = document.querySelector('#algolia-instant-selector-results');

    let instantsearchOptions = {
        searchClient: searchClient,
        indexName: indexName,
        // searchFunction: function (helper) {
        //     if (helper.state.query === '' && !algoliaConfig.isSearchPage) {
        //         replacedContent.style.display = 'block';
        //         instantSelectorResults.style.display = 'none';
        //     } else {
        //         helper.search();
        //         replacedContent.style.display = 'none';
        //         instantSelectorResults.style.display = 'block';
        //     }
        // },
        routing: window.routing
    }

    if (algoliaConfig.request.path.length > 0 && window.location.hash.indexOf('categories.level0') === -1) {
        if (algoliaConfig.areCategoriesInFacets === false) {
            searchParameters['facetsRefinements'] = {};
            searchParameters['facetsRefinements']['categories.level' + algoliaConfig.request.level] = [algoliaConfig.request.path];
        }
    }

    if (algoliaConfig.instant.isVisualMerchEnabled && algoliaConfig.isCategoryPage) {
        searchParameters.filters = `${algoliaConfig.instant.categoryPageIdAttribute}:'${algoliaConfig.request.path}'`;
    }

    instantsearchOptions = algolia.triggerHooks('beforeInstantsearchInit', instantsearchOptions);

    let search = instantsearch(instantsearchOptions);

    search.client.addAlgoliaAgent('Magento2 integration (' + algoliaConfig.extensionVersion + ')');

    /** Prepare sorting indices data */
    algoliaConfig.sortingIndices.unshift({
        name: indexName,
        label: algoliaConfig.translations.relevance
    });

    /** Setup attributes for current refinements widget **/
    let attributes = [];
    algoliaConfig.facets.forEach(function (facet) {
        let name = facet.attribute;

        if (name === 'categories') {
            name = 'categories.level0';
        }

        if (name === 'price') {
            name = facet.attribute + algoliaConfig.priceKey
        }

        attributes.push({
            name: name,
            label: facet.label ? facet.label : facet.attribute
        });
    });

    let allWidgetConfiguration = {
        infiniteHits: {},
        hits: {},
        configure: searchParameters,
        custom: [
            /**
             * Custom widget - this widget is used to refine results for search page or catalog page
             * Docs: https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js/
             **/
            {
                getWidgetSearchParameters: function (searchParameters) {
                    if (algoliaConfig.request.query.length > 0 && location.hash.length < 1) {
                        return searchParameters.setQuery(algolia.htmlspecialcharsDecode(algoliaConfig.request.query))
                    }
                    return searchParameters;
                },
                init: function (data) {
                    const page = data.helper.state.page;

                    if (algoliaConfig.request.refinementKey.length > 0) {
                        data.helper.toggleRefine(algoliaConfig.request.refinementKey, algoliaConfig.request.refinementValue);
                    }

                    if (algoliaConfig.isCategoryPage) {
                        data.helper.addNumericRefinement('visibility_catalog', '=', 1);
                    } else {
                        data.helper.addNumericRefinement('visibility_search', '=', 1);
                    }

                    data.helper.setPage(page);
                },
                render: function (data) {
                    if (!algoliaConfig.isSearchPage) {
                        if (data.results.query.length === 0 && data.results.nbHits === 0) {
                            replacedContent.style.display = 'block';
                            instantSelectorResults.style.display = 'none';
                        } else {
                            replacedContent.style.display = 'none';
                            instantSelectorResults.style.display = 'block';
                        }
                    }
                }
            },
            /**
             * Custom widget - Suggestions
             * This widget renders suggestion queries which might be interesting for your customer
             * Docs: https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js/
             **/
            {
                suggestions: [],
                init: function () {
                    if (algoliaConfig.showSuggestionsOnNoResultsPage) {
                        const _self = this;
                        let popuparQueries = algoliaConfig.popularQueries.slice(0, Math.min(4, algoliaConfig.popularQueries.length));
                        for (let i in popuparQueries) {
                            let query = popuparQueries[i];
                            _self.suggestions.push('<a href="' + algoliaConfig.baseUrl + '/catalogsearch/result/?q=' + encodeURIComponent(query) + '">' + query + '</a>');
                        }
                    }
                },
                render: function (data) {
                    const emptyContainer = document.getElementById('instant-empty-results-container');
                    if (data.results.hits.length === 0) {
                        var content = '<div class="no-results text-center">';
                        content += '<div><b>' + algoliaConfig.translations.noProducts + ' "' + '<span>' + data.results.query + '</span></b>"</div>';
                        content += '<div class="popular-searches py-2">';

                        if (algoliaConfig.showSuggestionsOnNoResultsPage && this.suggestions.length > 0) {
                            content += '<div>' + algoliaConfig.translations.popularQueries + '</div>' + this.suggestions.join(', ');
                        }

                        content += '</div>';
                        content += algoliaConfig.translations.or + ' <a href="' + algoliaConfig.baseUrl + '/catalogsearch/result/?q=__empty__">' + algoliaConfig.translations.seeAll + '</a>'

                        content += '</div>';

                        emptyContainer.innerHTML = content;
                    } else {
                        emptyContainer.innerHTML = '';
                    }
                }
            }
        ],
        /**
         * stats
         * Docs: https://www.algolia.com/doc/api-reference/widgets/stats/js/
         **/
        stats: {
            container: '#algolia-stats',
            templates: {
                text: function (data) {
                    const hoganTemplate = Hogan.compile(document.getElementById('instant-stats-template').innerHTML);

                    data.first = data.page * data.hitsPerPage + 1;
                    data.last = Math.min(data.page * data.hitsPerPage + data.hitsPerPage, data.nbHits);
                    data.seconds = data.processingTimeMS / 1000;
                    data.translations = algoliaConfig.translations;

                    return hoganTemplate.render(data)
                }
            }
        },
        /**
         * sortBy
         * Docs: https://www.algolia.com/doc/api-reference/widgets/sort-by/js/
         **/
        sortBy: {
            container: '#algolia-sorts',
            items: algoliaConfig.sortingIndices.map(function (sortingIndice) {
                return {
                    label: sortingIndice.label,
                    value: sortingIndice.name,
                }
            })
        },
        /**
         * currentRefinements
         * Widget displays all filters and refinements applied on query. It also let your customer to clear them one by one
         * Docs: https://www.algolia.com/doc/api-reference/widgets/current-refinements/js/
         **/
        currentRefinements: {
            container: '#current-refinements',
            // TODO: Remove this - it does nothing
            templates: {
                item: document.getElementById('current-refinements-template').innerHTML
            },
            includedAttributes: attributes.map(attribute => {
                if (attribute.name.indexOf('categories') === -1
                    || !algoliaConfig.isCategoryPage) // For category browse, requires a custom renderer to prevent removal of the root node from hierarchicalMenu widget
                    return attribute.name;
            }),

            transformItems: items => {
                return items
                    // This filter is only applicable if categories facet is included as an attribute
                    .filter(item => {
                        return !algoliaConfig.isCategoryPage
                            || item.refinements.filter(refinement => refinement.value !== algoliaConfig.request.path).length; // do not expose the category root
                    })
                    .map(item => {
                        const attribute = attributes.filter(_attribute => {
                            return item.attribute === _attribute.name
                        })[0];
                        if (!attribute) return item;
                        item.label = attribute.label;
                        item.refinements.forEach(function (refinement) {
                            if (refinement.type !== 'hierarchical') return refinement;

                            const levels = refinement.label.split(algoliaConfig.instant.categorySeparator);
                            const lastLevel = levels[levels.length - 1];
                            refinement.label = lastLevel;
                        });
                        return item;
                    });
            },

            /*
             * clearRefinements
             * Widget displays a button that lets the user clean every refinement applied to the search. You can control which attributes are impacted by the button with the options.
             * Docs: https://www.algolia.com/doc/api-reference/widgets/clear-refinements/js/
             **/
            clearRefinements: {
                container: '#clear-refinements',
                templates: {
                    resetLabel: algoliaConfig.translations.clearAll,
                },
                includedAttributes: attributes.map(function (attribute) {
                    if (!(algoliaConfig.isCategoryPage && attribute.name.indexOf('categories') > -1)) {
                        return attribute.name;
                    }
                }),
                cssClasses: {
                    button: ['action', 'primary']
                },
                transformItems: function (items) {
                    return items.map(function (item) {
                        const attribute = attributes.filter(function (_attribute) {
                            return item.attribute === _attribute.name
                        })[0];
                        if (!attribute) return item;
                        item.label = attribute.label;
                        return item;
                    })
                }
            },
            /*
             * queryRuleCustomData
             * The queryRuleCustomData widget displays custom data from Query Rules.
             * Docs: https://www.algolia.com/doc/api-reference/widgets/query-rule-custom-data/js/
             **/
            queryRuleCustomData: {
                container: '#algolia-banner',
                templates: {
                    default: '{{#items}} {{#banner}} {{{banner}}} {{/banner}} {{/items}}',
                }
            }
        }
    };

    if (algoliaConfig.instant.isSearchBoxEnabled) {
        /**
         * searchBox
         * Docs: https://www.algolia.com/doc/api-reference/widgets/search-box/js/
         **/
        allWidgetConfiguration.searchBox = {
            container: selectors.instant_selector,
            placeholder: algoliaConfig.translations.searchFor,
            showSubmit: false,
            queryHook: function (inputValue, search) {
                if (algoliaConfig.isSearchPage && algoliaConfig.request.categoryId.length <= 0 && algoliaConfig.request.landingPageId.length <= 0) {
                    document.querySelector(".page-title span").innerHTML = algoliaConfig.translations.searchTitle + ": '" + inputValue + "'";
                }
                return search(inputValue);
            }
        }
    }

    if (algoliaConfig.instant.infiniteScrollEnabled === true) {
        /**
         * infiniteHits
         * This widget renders all products into result page
         * Docs: https://www.algolia.com/doc/api-reference/widgets/infinite-hits/js/
         **/
        allWidgetConfiguration.infiniteHits = {
            container: '#instant-search-results-container',
            templates: {
                empty: '',
                item: document.getElementById('instant-hit-template').innerHTML,
                showMoreText: algoliaConfig.translations.showMore
            },
            cssClasses: {
                loadPrevious: ['action', 'primary'],
                loadMore: ['action', 'primary']
            },
            transformItems: function (items) {
                return items.map(function (item) {
                    item.__indexName = search.helper.lastResults.index;
                    item = transformHit(item, algoliaConfig.priceKey, search.helper);
                    // FIXME: transformHit is a global
                    item.isAddToCartEnabled = algoliaConfig.instant.isAddToCartEnabled;
                    return item;
                });
            },
            showPrevious: true,
            escapeHits: true
        };

        delete allWidgetConfiguration.hits;
    } else {
        /**
         * hits
         * This widget renders all products into result page
         * Docs: https://www.algolia.com/doc/api-reference/widgets/hits/js/
         **/
        allWidgetConfiguration.hits = {
            container: '#instant-search-results-container',
            templates: {
                empty: '',
                item: document.getElementById("instant-hit-template").innerHTML
            },
            transformItems: function (items, {results}) {
                if (results.nbPages <= 1 && algoliaConfig.instant.hidePagination === true) {
                    document.getElementById('instant-search-pagination-container').style.display = "none";
                } else {
                    document.getElementById('instant-search-pagination-container').style.display = "block";
                }
                return items.map(function (item) {
                    item.__indexName = search.helper.lastResults.index;
                    item = transformHit(item, algoliaConfig.priceKey, search.helper);
                    // FIXME: transformHit is a global
                    item.isAddToCartEnabled = algoliaConfig.instant.isAddToCartEnabled;
                    item.algoliaConfig = window.algoliaConfig;
                    return item;
                })
            }
        };

        /**
         * pagination
         * Docs: https://www.algolia.com/doc/api-reference/widgets/pagination/js/
         **/
        allWidgetConfiguration.pagination = {
            container: '#instant-search-pagination-container',
            showFirst: false,
            showLast: false,
            showNext: true,
            showPrevious: true,
            totalPages: 1000,
            templates: {
                previous: algoliaConfig.translations.previousPage,
                next: algoliaConfig.translations.nextPage
            },
        };

        delete allWidgetConfiguration.infiniteHits;
    }

    /**
     * Here are specified custom attributes widgets which require special code to run properly
     * Custom widgets can be added to this object like [attribute]: function(facet, templates)
     * Function must return an array [<widget name>: string, <widget options>: object]
     **/
    const customAttributeFacet = {
        categories: function (facet, templates) {
            const hierarchical_levels = [];
            for (let l = 0; l < 10; l++) {
                hierarchical_levels.push('categories.level' + l.toString());
            }

            const hierarchicalMenuParams = {
                container: facet.wrapper.appendChild(createISWidgetContainer(facet.attribute)),
                attributes: hierarchical_levels,
                separator: algoliaConfig.instant.categorySeparator,
                templates: templates,
                showParentLevel: true,
                limit: algoliaConfig.maxValuesPerFacet,
                rootPath: algoliaConfig.request.path,
                sortBy: ['name:asc'],
                transformItems(items) {
                    return (algoliaConfig.isCategoryPage)
                        ? items.map(
                            item => {
                                return {
                                    ...item,
                                    categoryUrl: algoliaConfig.instant.isCategoryNavigationEnabled ? algoliaConfig.request.childCategories[item.value]['url'] : ''
                                };
                            }
                        )
                        : items;
                },
            };

            hierarchicalMenuParams.templates.item = '' +
                '<a class="{{cssClasses.link}} {{#isRefined}}{{cssClasses.link}}--selected{{/isRefined}}" href="{{categoryUrl}}">{{label}}' + ' ' +
                '<span class="{{cssClasses.count}}">{{#helpers.formatNumber}}{{count}}{{/helpers.formatNumber}}</span>' +
                '</a>';
            hierarchicalMenuParams.panelOptions = {
                templates: {
                    header: '<div class="name">' + (facet.label ? facet.label : facet.attribute) + '</div>',
                },
                hidden: function ({items}) {
                    return !items.length;
                }
            };

            return ['hierarchicalMenu', hierarchicalMenuParams];
        }
    };

    /** Add all facet widgets to instantsearch object **/
    window.getFacetWidget = function (facet, templates) {
        const panelOptions = {
            templates: {
                header: '<div class="name">'
                    + (facet.label ? facet.label : facet.attribute)
                    + '</div>',
            },
            hidden: function (options) {
                if (options.results.nbPages <= 1 && algoliaConfig.instant.hidePagination === true) {
                    document.getElementById('instant-search-pagination-container').style.display = "none";
                } else {
                    document.getElementById('instant-search-pagination-container').style.display = "block";
                }
                if (!options.results) return true;
                switch (facet.type) {
                    case 'conjunctive':
                        let facetsNames = options.results.facets.map(function (f) {
                            return f.name
                        });
                        return facetsNames.indexOf(facet.attribute) === -1;
                    case 'disjunctive':
                        let disjunctiveFacetsNames = options.results.disjunctiveFacets.map(function (f) {
                            return f.name
                        });
                        return disjunctiveFacetsNames.indexOf(facet.attribute) === -1;
                    default:
                        return false;
                }
            }
        };
        if (facet.type === 'priceRanges') {
            delete templates.item;

            const priceConfig = {
                separatorText: algoliaConfig.translations.to,
                submitText: algoliaConfig.translations.go
            }

            return ['rangeInput', {
                container: facet.wrapper.appendChild(createISWidgetContainer(facet.attribute)),
                attribute: facet.attribute,
                templates: {...priceConfig, ...templates},
                cssClasses: {
                    root: 'conjunctive'
                },
                panelOptions: panelOptions,
            }];
        }

        if (facet.type === 'conjunctive') {
            let refinementListOptions = {
                container: facet.wrapper.appendChild(createISWidgetContainer(facet.attribute)),
                attribute: facet.attribute,
                limit: algoliaConfig.maxValuesPerFacet,
                operator: 'and',
                templates: templates,
                sortBy: ['count:desc', 'name:asc'],
                cssClasses: {
                    root: 'conjunctive'
                },
                panelOptions: panelOptions
            };

            refinementListOptions = addSearchForFacetValues(facet, refinementListOptions);

            return ['refinementList', refinementListOptions];
        }

        if (facet.type === 'disjunctive') {
            let refinementListOptions = {
                container: facet.wrapper.appendChild(createISWidgetContainer(facet.attribute)),
                attribute: facet.attribute,
                limit: algoliaConfig.maxValuesPerFacet,
                operator: 'or',
                templates: templates,
                sortBy: ['count:desc', 'name:asc'],
                panelOptions: panelOptions,
                cssClasses: {
                    root: 'disjunctive'
                }
            };

            refinementListOptions = addSearchForFacetValues(facet, refinementListOptions);

            return ['refinementList', refinementListOptions];
        }

        if (facet.type === 'slider') {
            delete templates.item;

            return ['rangeSlider', {
                container: facet.wrapper.appendChild(createISWidgetContainer(facet.attribute)),
                attribute: facet.attribute,
                templates: templates,
                pips: false,
                panelOptions: panelOptions,
                tooltips: {
                    format: function (formattedValue) {
                        return facet.attribute.match(/price/) === null ?
                            parseInt(formattedValue) :
                            hyva.formatPrice(formattedValue);
                    }
                }
            }];
        }
    };

    let facetWrapper = document.getElementById('instant-search-facets-container');
    for (let facetIndex in algoliaConfig.facets) {
        let facet = algoliaConfig.facets[facetIndex];
        if (facet.attribute.indexOf("price") !== -1)
            facet.attribute = facet.attribute + algoliaConfig.priceKey;

        facet.wrapper = facetWrapper;

        const templates = {
            item: document.getElementById('refinements-lists-item-template').innerHTML
        };

        const widgetInfo = customAttributeFacet[facet.attribute] !== undefined ?
            customAttributeFacet[facet.attribute](facet, templates) :
            getFacetWidget(facet, templates);

        const widgetType = widgetInfo[0],
            widgetConfig = widgetInfo[1];

        if (typeof allWidgetConfiguration[widgetType] === 'undefined') {
            allWidgetConfiguration[widgetType] = [widgetConfig];
        } else {
            allWidgetConfiguration[widgetType].push(widgetConfig);
        }
    }


    if (algoliaConfig.analytics.enabled) {
        if (typeof algoliaAnalyticsPushFunction !== 'function') {
            let algoliaAnalyticsPushFunction = function (formattedParameters, state, results) {
                const trackedUrl = '/catalogsearch/result/?q=' + state.query + '&' + formattedParameters + '&numberOfHits=' + results.nbHits;

                // Universal Analytics
                if (typeof window.ga !== 'undefined') {
                    window.ga('set', 'page', trackedUrl);
                    window.ga('send', 'pageView');
                }
            };
        }

        allWidgetConfiguration['analytics'] = {
            pushFunction: algoliaAnalyticsPushFunction,
            delay: algoliaConfig.analytics.delay,
            triggerOnUIInteraction: algoliaConfig.analytics.triggerOnUiInteraction,
            pushInitialSearch: algoliaConfig.analytics.pushInitialSearch
        };
    }

    allWidgetConfiguration = algolia.triggerHooks('beforeWidgetInitialization', allWidgetConfiguration);

    for (let widgetType in allWidgetConfiguration) {
        if (Array.isArray(allWidgetConfiguration[widgetType]) === true) {
            for (let i in allWidgetConfiguration[widgetType]) {
                addWidget(search, widgetType, allWidgetConfiguration[widgetType][i], instantsearch);
            }
        } else {
            addWidget(search, widgetType, allWidgetConfiguration[widgetType], instantsearch);
        }
    }

    // Capture active redirect URL with IS facet params for add to cart from PLP
    if (algoliaConfig.instant.isAddToCartEnabled) {
        search.on('render', () => {
            const cartForms = document.querySelectorAll('[data-role="tocart-form"]');
            cartForms.forEach((form, i) => {
                const ts = Date.now();
                form.addEventListener('submit', e => {
                    const url = `${algoliaConfig.request.url}${window.location.search}`;
                    e.target.elements[algoliaConfig.instant.addToCartParams.redirectUrlParam].value = AlgoliaBase64.mageEncode(url);
                })
            });
        });
    }

    /** Initialise searching **/
    let isStarted = false;

    function startInstantSearch(search) {
        if (isStarted === true) {
            return;
        }

        search = algolia.triggerHooks('beforeInstantsearchStart', search);
        search.start();
        algolia.triggerHooks('afterInstantsearchStart', search);

        isStarted = true;
    }

    /** Initialise searching **/
    startInstantSearch(search);

    function addWidget(search, type, config, instantsearch) {
        if (type === 'custom') {
            search.addWidgets([config]);
            return;
        }
        let widget = instantsearch.widgets[type];
        if (config.panelOptions) {
            widget = instantsearch.widgets.panel(config.panelOptions)(widget);
            delete config.panelOptions;
        }
        if (type === "rangeSlider" && config.attribute.indexOf("price.") < 0) {
            config.panelOptions = {
                hidden(options) {
                    return options.range.min === 0 && options.range.max === 0;
                },
            };
            widget = instantsearch.widgets.panel(config.panelOptions)(widget);
            delete config.panelOptions;
        }

        search.addWidgets([widget(config)]);
    }

    function addSearchForFacetValues(facet, options) {
        if (facet.searchable === '1') {
            options.searchable = true;
            options.searchableIsAlwaysActive = false;
            options.searchablePlaceholder = algoliaConfig.translations.searchForFacetValuesPlaceholder;
            options.templates = options.templates || {};
            options.templates.searchableNoResults = '<div class="sffv-no-results">' + algoliaConfig.translations.noResults + '</div>';
        }
        return options;
    }
}
