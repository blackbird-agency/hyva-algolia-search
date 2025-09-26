function initAlgoliaInstantSearch() {
    const selectors = {
        instantResultsWrapper: 'algolia-instant-results-wrapper',
        instant_selector: '#instant-search-bar'
    }

    ///////////////////////////
    //       Properties      //
    ///////////////////////////

    let isStarted = false;
    let minQuerySuggestions = 4;
    let dynamicWidgets = [];
    let hasInteracted = false;

    ///////////////////////////
    //  Main build functions //
    ///////////////////////////

    function initialize() {
        // Initialize template processor first, then build instant search
        initTemplateProcessor().then(() => {
            buildInstantSearch();
        });
    }

    /**
     * Initialize template processor asynchronously
     * @returns {Promise<void>}
     */
    async function initTemplateProcessor() {
        window.templateProcessor = await window.templateEngine.getSelectedEngineAdapter();
    }

    /**
     * Load and display search results using Algolia's InstantSearch.js library v4
     *
     * This is the main entry point for building the Magento InstantSearch experience.
     *
     * Rough overview of build process:
     *
     * - Initializes dependencies
     * - Creates the DOM elements where InstantSearch widgets will be inserted on the PLP (aka the "wrapper")
     * - Creates the InstantSearch object with configured options
     * - All widgets are preconfigured using the `allWidgetConfiguration` object
     *      - This object houses all widgets to be displayed in the frontend experience and is important for customization
     *      - Passed to `beforeWidgetInitialization` hook
     *      - Implementation is specific to Magento index object data structure
     * - Loads `allWidgetConfiguration` into InstantSearch
     * - Starts InstantSearch which adds the widgets to the DOM and performs first search
     *
     * Docs: https://www.algolia.com/doc/api-reference/widgets/instantsearch/js/
     */
    function buildInstantSearch() {

        if (!checkInstantSearchEnablement()) return;

        invokeLegacyHooks();

        setupWrapper();

        const search = instantsearch(instantsearchOptions);

        search.client.addAlgoliaAgent(getAlgoliaAgent());

        /** Prepare sorting indices data */
        algoliaConfig.sortingIndices.unshift({
            name: indexName,
            label: algoliaConfig.translations.relevance,
        });

        const indexName = algoliaConfig.indexName + '_products';

        let instantsearchOptions = algolia.triggerHooks(
            'beforeInstantsearchInit',
            {
                searchClient: algoliasearch(algoliaConfig.applicationId, algoliaConfig.apiKey),
                indexName: indexName,
                routing: window.routing
            },
        );

        const currentRefinementsAttributes = getCurrentRefinementsAttributes();

        const replacedContent = document.querySelector('.algolia-instant-replaced-content');
        const instantSelectorResults = document.querySelector('#algolia-instant-selector-results');

        let allWidgetConfiguration = {
            infiniteHits: {},
            hits: {},
            configure: getSearchParameters(),
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
                            data.helper.toggleRefine(
                                algoliaConfig.request.refinementKey,
                                algoliaConfig.request.refinementValue
                            );
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
                            if (
                                data.results.query.length === 0 &&
                                data.results.nbHits === 0
                            ) {
                                replacedContent.style.display = 'block';
                                instantSelectorResults.style.display = 'none';
                            } else {
                                replacedContent.style.display = 'none';
                                instantSelectorResults.style.display = 'block';
                            }
                        }
                    },
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
                    },
                },
            ],
            /**
             * stats
             * Docs: https://www.algolia.com/doc/api-reference/widgets/stats/js/
             **/
            stats: {
                container: '#algolia-stats',
                templates: {
                    text: function (data) {
                        data.first = data.page * data.hitsPerPage + 1;
                        data.last = Math.min(data.page * data.hitsPerPage + data.hitsPerPage, data.nbHits);
                        data.seconds = data.processingTimeMS / 1000;
                        data.translations = algoliaConfig.translations;

                        const searchParams = new URLSearchParams(window.location.search);
                        const searchQuery = searchParams.has('q') || '';
                        if (searchQuery === '' && !algoliaConfig.isSearchPage) {
                            replacedContent.style.display = 'block';
                            instantSelectorResults.style.display = 'none';
                        } else {
                            replacedContent.style.display = 'none';
                            instantSelectorResults.style.display = 'block';
                        }

                        const template = document.getElementById('instant-stats-template').innerHTML;
                        return window.templateProcessor.process(template, data);
                    },
                },
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
                    };
                }),
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
                includedAttributes: currentRefinementsAttributes.map(attribute => {
                    if (attribute.name.indexOf('categories') === -1 ||
                        !algoliaConfig.isCategoryPage
                    )
                        // For category browse, requires a custom renderer to prevent removal of the root node from hierarchicalMenu widget
                        return attribute.name;
                }),

                transformItems: (items) => {
                    return (
                        items
                            // This filter is only applicable if categories facet is included as an attribute
                            .filter((item) => {
                                return (
                                    !algoliaConfig.isCategoryPage ||
                                    item.refinements.filter(
                                        (refinement) =>
                                            refinement.value !== algoliaConfig.request.path
                                    ).length
                                ); // do not expose the category root
                            })
                            .map((item) => {
                                const attribute = currentRefinementsAttributes.filter((_attribute) => {
                                    return item.attribute === _attribute.name;
                                })[0];
                                if (!attribute) return item;
                                item.label = attribute.label;
                                item.refinements.forEach(function (refinement) {
                                    if (refinement.type !== 'hierarchical') return refinement;

                                    const levels = refinement.label.split(
                                        algoliaConfig.instant.categorySeparator
                                    );
                                    const lastLevel = levels[levels.length - 1];
                                    refinement.label = lastLevel;
                                });
                                return item;
                            })
                    );
                },
            },

            /*
             * clearRefinements
             * Widget displays a button that lets the user clean every refinement applied to the search. You can control which attributes are impacted by the button with the options.
             * Docs: https://www.algolia.com/doc/api-reference/widgets/clear-refinements/js/
             **/
            clearRefinements: {
                container: '#clear-refinements',
                templates: {
                    resetLabel({hasRefinements}, {html}) {
                        return hasRefinements ? html`<span>${algoliaConfig.translations.clearAll}</span>` : '';
                    }
                },
                includedAttributes: currentRefinementsAttributes.map(function (attribute) {
                    if (!(algoliaConfig.isCategoryPage && attribute.name.indexOf('categories') > -1)) {
                        return attribute.name;
                    }
                }),
                cssClasses: {
                    button: ['action', 'primary']
                },
                transformItems: function (items) {
                    return items.map(function (item) {
                        const attribute = currentRefinementsAttributes.filter(function (_attribute) {
                            return item.attribute === _attribute.name
                        })[0];
                        if (!attribute) return item;
                        item.label = attribute.label;
                        return item;
                    });
                },
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
                },
            },
        }

        if (algoliaConfig.instant.isSearchBoxEnabled) {
            /**
             * searchBox
             * Docs: https://www.algolia.com/doc/api-reference/widgets/search-box/js/
             **/
            allWidgetConfiguration.searchBox = {
                container: selectors.instant_selector,
                placeholder: algoliaConfig.translations.searchFor,
                showSubmit: false,
                queryHook: (inputValue, search) => {
                    if (
                        algoliaConfig.isSearchPage &&
                        !algoliaConfig.request.categoryId &&
                        !algoliaConfig.request.landingPageId.length
                    ) {
                        document.querySelector(".page-title span").innerHTML =
                            algoliaConfig.translations.searchTitle +
                            ": '" + inputValue +
                            "'";
                    }
                    return search(inputValue);
                },
            };
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
                    showMoreText: algoliaConfig.translations.showMore,
                },
                cssClasses: {
                    loadPrevious: ['action', 'primary'],
                    loadMore: ['action', 'primary'],
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
                    if (
                        results.nbPages <= 1 &&
                        algoliaConfig.instant.hidePagination === true
                    ) {
                        document.getElementById('instant-search-pagination-container').style.display = "none";
                    } else {
                        document.getElementById('instant-search-pagination-container').style.display = "block";
                    }
                    return items.map(function (item) {
                        item.__indexName = search.helper.lastResults.index;
                        item = transformHit(item, algoliaConfig.priceKey, search.helper);
                        item.isAddToCartEnabled = algoliaConfig.instant.isAddToCartEnabled;
                        item.algoliaConfig = window.algoliaConfig;
                        return item;
                    });
                },
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
                    next: algoliaConfig.translations.nextPage,
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
                    container: facet.wrapper.appendChild(
                        createISWidgetContainer(facet.attribute)
                    ),
                    attributes: hierarchical_levels,
                    separator: algoliaConfig.instant.categorySeparator,
                    templates: templates,
                    showParentLevel: true,
                    limit: algoliaConfig.maxValuesPerFacet,
                    sortBy: ['name:asc'],
                    transformItems(items) {
                        return algoliaConfig.isCategoryPage
                            ? items.map((item) => {
                                    return {
                                        ...item,
                                        categoryUrl: algoliaConfig.instant
                                            .isCategoryNavigationEnabled
                                            ? algoliaConfig.request.childCategories[item.value]['url']
                                            : '',
                                    };
                                }
                            )
                            : items;
                    },
                };

                if (algoliaConfig.isCategoryPage) {
                    hierarchicalMenuParams.rootPath = algoliaConfig.request.path;
                }

                hierarchicalMenuParams.templates.item =
                    '<a class="{{cssClasses.link}} {{#isRefined}}{{cssClasses.link}}--selected{{/isRefined}}" href="{{categoryUrl}}"><span class="{{cssClasses.label}}">{{label}}</span>' +
                    ' ' +
                    '<span class="{{cssClasses.count}}">{{#helpers.formatNumber}}{{count}}{{/helpers.formatNumber}}</span>' +
                    '</a>';
                hierarchicalMenuParams.panelOptions = {
                    templates: {
                        header: '<div class="name">' + (facet.label ? facet.label : facet.attribute) + '</div>',
                    },
                    hidden: function ({items}) {
                        return !items.length;
                    },
                };

                return ['hierarchicalMenu', hierarchicalMenuParams];
            },
        };

        /** Add all facet widgets to instantsearch object **/
        let facetWrapper = document.getElementById('instant-search-facets-container');
        for (let facetIndex in algoliaConfig.facets) {
            let facet = algoliaConfig.facets[facetIndex];
            if (facet.attribute.indexOf("price") !== -1)
                facet.attribute = facet.attribute + algoliaConfig.priceKey;

            facet.wrapper = facetWrapper;

            const templates = {
                item: document.getElementById('refinements-lists-item-template').innerHTML
            };

            const widgetInfo = customAttributeFacet[facet.attribute] !== undefined
                ? customAttributeFacet[facet.attribute](facet, templates)
                : getFacetWidget(facet, templates);

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
                let algoliaAnalyticsPushFunction = function (
                    formattedParameters,
                    state,
                    results
                ) {
                    const trackedUrl =
                        '/catalogsearch/result/?q=' +
                        state.query +
                        '&' +
                        formattedParameters +
                        '&numberOfHits=' +
                        results.nbHits;

                    // Universal Analytics
                    if (typeof window.ga !== 'undefined') {
                        window.ga('set', 'page', trackedUrl);
                        window.ga('send', 'pageView');
                    }
                };

                allWidgetConfiguration['analytics'] = {
                    pushFunction: algoliaAnalyticsPushFunction,
                };
            }

            allWidgetConfiguration['analytics'] = {
                ...allWidgetConfiguration['analytics'],
                delay: algoliaConfig.analytics.delay,
                triggerOnUIInteraction: algoliaConfig.analytics.triggerOnUiInteraction,
                pushInitialSearch: algoliaConfig.analytics.pushInitialSearch,
            };
        }

        allWidgetConfiguration = algolia.triggerHooks(
            'beforeWidgetInitialization',
            allWidgetConfiguration
        );

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
                    form.addEventListener('submit', (e) => {
                        const url = `${algoliaConfig.request.url}${window.location.search}`;
                        e.target.elements[
                            algoliaConfig.instant.addToCartParams.redirectUrlParam
                            ].value = window.AlgoliaBase64.mageEncode(url);
                    });
                });
            });
        }

        startInstantSearch(search);
        addMobileRefinementsToggle();
    }

    /**
     * @deprecated - these hooks will be removed in a future version
     */
    function invokeLegacyHooks() {
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
    }

    /**
     * Pre-flight checks
     *
     * @returns {boolean} Returns true if InstantSearch is good to go
     */
    function checkInstantSearchEnablement() {
        if (
            typeof algoliaConfig === 'undefined' ||
            !algoliaConfig.instant.enabled ||
            !algoliaConfig.isSearchPage
        ) {
            return false;
        }

        const instantElement = document.querySelector(algoliaConfig.instant.selector);

        if (!instantElement) {
            throw new Error(
                `[Algolia] Invalid instant-search selector: ${algoliaConfig.instant.selector}`
            );
        }

        if (
            algoliaConfig.autocomplete.enabled &&
            instantElement.querySelector(algoliaConfig.autocomplete.selector)
        ) {
            throw new Error(
                `[Algolia] You can't have a search input matching "${algoliaConfig.autocomplete.selector}" ` +
                `inside your instant selector "${algoliaConfig.instant.selector}"`
            );
        }

        return true;
    }

    /**
     * Handle nested Autocomplete (legacy)
     * @returns {boolean}
     */
    function findAutocomplete() {
        if (algoliaConfig.autocomplete.enabled) {
            var parent = document.querySelector(algoliaConfig.instant.selector);
            if (parent) {
                var nestedAC = parent.querySelector('#algolia-autocomplete-container');
                if (nestedAC && nestedAC.parentNode) {
                    nestedAC.parentNode.removeChild(nestedAC);
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Setup wrapper DOM object to contain InstantSearch
     */
    function setupWrapper() {
        // Add class to instant selector
        document.querySelector(algoliaConfig.instant.selector).classList.add('algolia-instant-replaced-content');

        // Create wrapper element
        const el = document.querySelector(algoliaConfig.instant.selector);
        let wrapperEl = document.createElement('div');
        wrapperEl.setAttribute("id", selectors.instantResultsWrapper);
        el.parentNode.insertBefore(wrapperEl, el);
        wrapperEl.appendChild(el);

        const template = document.querySelector('#instant_wrapper_template').innerHTML;
        let templateVars = {
            second_bar: algoliaConfig.instant.enabled,
            findAutocomplete: findAutocomplete(),
            config: algoliaConfig.instant,
            translations: algoliaConfig.translations,
        };

        const wrapperHtml = templateProcessor.process(template, templateVars);

        // Add wrapper to DOM
        document.getElementById(selectors.instantResultsWrapper).innerHTML += '<div id="algolia-instant-selector-results">' + wrapperHtml + '</div>';
        document.querySelector('#algolia-instant-selector-results').innerHTML = wrapperHtml;
        document.getElementById(selectors.instantResultsWrapper).style.display = 'block';
    }

    /**
     * @returns {string[]}
     */
    function getRuleContexts() {
        const ruleContexts = ['magento_filters', '']; // Empty context to keep BC for already create rules in dashboard
        if (algoliaConfig.request.categoryId.length) {
            ruleContexts.push('magento-category-' + algoliaConfig.request.categoryId);
        }

        if (algoliaConfig.request.landingPageId.length) {
            ruleContexts.push(
                'magento-landingpage-' + algoliaConfig.request.landingPageId
            );
        }
        return ruleContexts;
    }

    /**
     * Get search parameters for configure widget
     * @returns {Object}
     */
    function getSearchParameters() {
        const searchParameters = {
            hitsPerPage: algoliaConfig.hitsPerPage,
            ruleContexts: getRuleContexts()
        };

        if (
            algoliaConfig.request.path.length &&
            window.location.hash.indexOf('categories.level0') === -1
        ) {
            if (!algoliaConfig.areCategoriesInFacets) {
                searchParameters['facetsRefinements'] = {};
                searchParameters['facetsRefinements']['categories.level' + algoliaConfig.request.level] = [algoliaConfig.request.path];
            }
        }

        if (algoliaConfig.instant.isVisualMerchEnabled && algoliaConfig.isCategoryPage) {
            searchParameters.filters = `${
                algoliaConfig.instant.categoryPageIdAttribute
            }:"${algoliaConfig.request.path.replace(/"/g, '\\"')}"`;
        }

        return searchParameters;
    }

    /**
     * @returns {string}
     */
    function getAlgoliaAgent() {
        return 'Magento2 integration (' + algoliaConfig.extensionVersion + ')';
    }

    /**
     * Setup attributes for current refinements widget
     * @returns {*[]}
     */
    function getCurrentRefinementsAttributes() {
        let attributes = [];
        algoliaConfig.facets.forEach(function (facet) {
            let name = facet.attribute;

            if (name === 'categories') {
                name = 'categories.level0';
            }

            if (name === 'price') {
                name = facet.attribute + algoliaConfig.priceKey;
            }

            attributes.push({
                name: name,
                label: facet.label ? facet.label : facet.attribute,
            });
        });

        return attributes;
    }


    function startInstantSearch(search) {
        if (isStarted === true) {
            return;
        }
        search = algolia.triggerHooks(
            'beforeInstantsearchStart',
            search
        );
        search.start();

        search = algolia.triggerHooks(
            'afterInstantsearchStart',
            search
        );
        isStarted = true;
    }

    function getFacetWidget(facet, templates) {
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

            return ['rangeSlider',
                {
                    container: facet.wrapper.appendChild(
                        createISWidgetContainer(facet.attribute)
                    ),
                    attribute: facet.attribute,
                    templates: templates,
                    pips: false,
                    panelOptions: panelOptions,
                    tooltips: {
                        format: function (formattedValue) {
                            return facet.attribute.match(/price/) === null
                                ? parseInt(formattedValue)
                                : hyva.formatPrice(formattedValue);
                        }
                    }
                }];
        }
    }


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

    function addMobileRefinementsToggle() {
        //TODO Emilie to js
        document.addEventListener('DOMContentLoaded', function () {
            var refineToggle = document.getElementById('refine-toggle');
            var facetsContainer = document.getElementById('instant-search-facets-container');

            if (refineToggle && facetsContainer) {
                refineToggle.addEventListener('click', function () {
                    facetsContainer.classList.toggle('hidden-xs');

                    var currentText = refineToggle.innerHTML.trim();
                    if (currentText[0] === '+') {
                        refineToggle.innerHTML = '- ' + algoliaConfig.translations.refine;
                    } else {
                        refineToggle.innerHTML = '+ ' + algoliaConfig.translations.refine;
                    }
                });
            }
        });
    }


    // Initialize the Algolia InstantSearch
    initialize();
}
