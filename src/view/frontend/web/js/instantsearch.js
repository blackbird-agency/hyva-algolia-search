function initAlgoliaInstantSearch() {

    ///////////////////////////
    //       Properties      //
    ///////////////////////////

    const selectors = {
        instantResultsWrapper: 'algolia-instant-results-wrapper',
        instant_selector: '#instant-search-bar'
    }

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
    async function buildInstantSearch() {
        if (!checkInstantSearchEnablement()) return;

        const templateProcessor = await templateEngine.getSelectedEngineAdapter();

        const mockAlgoliaBundleData = mockAlgoliaBundle();

        invokeLegacyHooks();

        setupWrapper(templateProcessor);

        const search = instantsearch(getInstantSearchOptions(mockAlgoliaBundle));

        search.client.addAlgoliaAgent(getAlgoliaAgent());

        prepareSortingIndices();

        initializeWidgets(
            search,
            getAllWidgetConfiguration(search, templateProcessor),
            mockAlgoliaBundleData
        );

        if (algoliaConfig.instant.isAddToCartEnabled) {
            handleAddToCart(search);
        }

        startInstantSearch(search, mockAlgoliaBundleData);

        addMobileRefinementsToggle();
    }

    /**
     * Build wrapper DOM object to contain InstantSearch widgets
     *
     * @param templateProcessor
     */
    function setupWrapper(templateProcessor) {
        const div = document.createElement('div');
        div.className = 'algolia-instant-results-wrapper';

        const selector = document.querySelector(algoliaConfig.instant.selector);
        selector.classList.add('algolia-instant-replaced-content');

        selector.parentNode.insertBefore(div, selector);
        div.appendChild(selector);

        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'algolia-instant-selector-results';
        div.appendChild(resultsDiv);

        const template = getTemplateContentsFromDOM('#instant_wrapper_template');
        const templateVars = {
            second_bar: algoliaConfig.instant.enabled,
            config: algoliaConfig.instant,
            translations: algoliaConfig.translations,
        };

        const wrapperHtml = templateProcessor.process(template, templateVars);
        resultsDiv.innerHTML = wrapperHtml;
        resultsDiv.style.display = 'block';
    }

    /**
     * Load the supplied widget configuration into InstantSearch
     *
     * Triggers the hook: beforeWidgetInitialization
     *
     * @param search
     * @param allWidgetConfiguration
     * @param mockAlgoliaBundle
     */
    function initializeWidgets(search, allWidgetConfiguration, mockAlgoliaBundle) {
        allWidgetConfiguration = window.algolia.triggerHooks(
            'beforeWidgetInitialization',
            allWidgetConfiguration,
            mockAlgoliaBundle
        );

        Object.entries(allWidgetConfiguration).forEach(([widgetType, widgetConfig]) => {
            if (Array.isArray(widgetConfig)) {
                for (const subWidgetConfig of widgetConfig) {
                    addWidget(search, widgetType, subWidgetConfig);
                }
            } else {
                addWidget(search, widgetType, widgetConfig);
            }
        });

        if (dynamicWidgets.length) {
            initializeDynamicWidgets(search);
        }
    }

    /**
     * Builds the allWidgetConfiguration that is used to define the widgets added to InstantSearch
     * This object is also passed to the `beforeWidgetInitialization` hook
     * See https://www.algolia.com/doc/integration/magento-2/customize/custom-front-end-events/#instantsearch-page-events
     *
     * @param search
     * @param templateProcessor
     * @returns {Object<string, Object>}
     */
    function getAllWidgetConfiguration(search, templateProcessor) {
        let allWidgetConfiguration = {
            configure          : getSearchParameters(),
            custom             : getCustomWidgets(),
            stats              : getStatsWidget(templateProcessor),
            sortBy             : getSortByWidget(),
            queryRuleCustomData: getQueryRuleCustomDataWidget(),
        };

        if (algoliaConfig.instant.isSearchBoxEnabled) {
            allWidgetConfiguration.searchBox = getSearchBoxWidget()
        }

        allWidgetConfiguration = configureHits(allWidgetConfiguration, search);

        allWidgetConfiguration = configureRefinements(allWidgetConfiguration);

        allWidgetConfiguration = configureFacets(allWidgetConfiguration);

        if (algoliaConfig.analytics.enabled) {
            allWidgetConfiguration.analytics = getAnalyticsWidget()
        }

        return allWidgetConfiguration;
    }

    /**
     * Process a passed widget config object and add to InstantSearch
     * Dynamic widgets are deferred as they must be aggregated and processed separately
     *
     * @param search InstantSearch object
     * @param type True InstantSearch widget type
     * @param config Widget config object
     */
    function addWidget(search, type, config) {
        if (type === 'custom') {
            search.addWidgets([config]);
            return;
        }

        if (algoliaConfig.instant.isDynamicFacetsEnabled && isDynamicFacetsEligible(type)) {
            // we cannot pre-bake the dynamicWidget - defer and package the type with the config
            dynamicWidgets.push({ ...config, type });
            return;
        }

        search.addWidgets([getConfiguredWidget(instantsearch.widgets[type], config)]);
    }

    /**
     * Return a fully configured widget, panelized (as needed) based on the supplied raw config object
     * @param widget
     * @param config
     */
    function getConfiguredWidget(widget, config) {
        if (config.panelOptions) {
            widget = instantsearch.widgets.panel(config.panelOptions)(widget);
            delete config.panelOptions; // facet config attribute only NOT IS widget attribute
        }
        return widget(config);
    }

    /**
     * Assigns designated facets to InstantSearch dynamicWidgets
     *
     * Docs: https://www.algolia.com/doc/api-reference/widgets/dynamic-facets/js/
     * @param search
     */
    function initializeDynamicWidgets(search) {
        const { dynamicWidgets } = instantsearch.widgets;
        search.addWidget(
            dynamicWidgets({
                container: '#instant-search-facets-container',
                widgets: dynamicWidgets.map(config => {
                    const { type, ...raw } = config;
                    const widget = instantsearch.widgets[type];
                    // The dynamicWidgets container must be derived at run time
                    return container => {
                        return getConfiguredWidget(
                            widget,
                            {
                                ...raw,
                                container
                            }
                        );
                    };
                })
            })
        );
    }

    /**
     * Determines which widgets will be included for dynamic faceting
     * Does not rely on algoliaConfig.facets in case custom facets have been defined
     *
     * @param widgetType
     * @returns {boolean}
     */
    function isDynamicFacetsEligible(widgetType) {
        return [
            'refinementList',
            'menu',
            'hierarchicalMenu',
            'numericMenu',
            'rangeInput',
            'rangeSlider',
            'ratingMenu',
            'toggleRefinement'
        ].includes(widgetType);
    }

    /**
     * Starts InstantSearch which adds all pre-loaded widgets to the DOM and triggers the first search
     *
     * Docs: https://www.algolia.com/doc/api-reference/widgets/instantsearch/js/#widget-param-start
     *
     * Triggers the hooks:
     *  - beforeInstantsearchStart
     *  - afterInstantsearchStart
     *
     * @param search
     * @param mockAlgoliaBundle
     */
    function startInstantSearch(search, mockAlgoliaBundle) {
        if (isStarted) {
            return;
        }
        search = window.algolia.triggerHooks(
            'beforeInstantsearchStart',
            search,
            mockAlgoliaBundle
        );
        search.start();
        search = window.algolia.triggerHooks(
            'afterInstantsearchStart',
            search,
            mockAlgoliaBundle
        );
        isStarted = true;
    }

    ////////////////////////////
    //     Search results     //
    ////////////////////////////

    /**
     * Setup hits and pagination based on configuration
     *
     * @param allWidgetConfiguration
     * @param search
     * @returns {*}
     */
    function configureHits(allWidgetConfiguration, search) {
        if (algoliaConfig.instant.infiniteScrollEnabled) {
            allWidgetConfiguration.infiniteHits = getInfiniteHitsWidget(search);
        } else {
            allWidgetConfiguration.hits = getHitsWidget(search);
            allWidgetConfiguration.pagination = getPaginationWidget();
        }
        return allWidgetConfiguration;
    }

    /**
     * hits
     * This widget renders products into result page as paginated hits
     * Docs: https://www.algolia.com/doc/api-reference/widgets/hits/js/
     *
     * @param search
     * @returns {{container: string, transformItems: (function(*, {results: *}): *), templates: {item: string, empty: string}}}
     */
    function getHitsWidget(search) {
        return {
            container     : '#instant-search-results-container',
            templates     : {
                empty: '<div></div>',
                item : getTemplateContentsFromDOM('#instant-hit-template')
            },
            transformItems: function (items, {results}) {
                if (algoliaConfig.instant.hidePagination) {
                    document.getElementById(
                        'instant-search-pagination-container'
                    ).style.display = results.nbPages <= 1 ? 'none' : 'block';
                }

                return items.map(function (item) {
                    item.__indexName = search.helper.lastResults.index;
                    item = window.transformHit(item, algoliaConfig.priceKey, search.helper);
                    item.isAddToCartEnabled = algoliaConfig.instant.isAddToCartEnabled;
                    item.algoliaConfig = window.algoliaConfig;
                    return item;
                });
            },
        };
    }

    /**
     * pagination
     * Docs: https://www.algolia.com/doc/api-reference/widgets/pagination/js/
     *
     * @returns {{container: string, templates: {next: string, previous: string, totalPages: number, showLast: boolean, showFirst: boolean, showNext: boolean, showPrevious: boolean}}}
     */
    function getPaginationWidget() {
        return {
            container   : '#instant-search-pagination-container',
            showFirst   : false,
            showLast    : false,
            showNext    : true,
            showPrevious: true,
            totalPages  : 1000,
            templates   : {
                previous: algoliaConfig.translations.previousPage,
                next    : algoliaConfig.translations.nextPage,
            },
        }
    }

    /**
     * infiniteHits
     * This widget renders products into result page as infinite scrolling hits
     * Docs: https://www.algolia.com/doc/api-reference/widgets/infinite-hits/js/
     *
     * @param search
     * @returns {{container: string, cssClasses: {loadPrevious: string[], loadMore: string[]}, transformItems: (function(*): *), templates: {item: string, showMoreText: string, empty: string}, escapeHits: boolean, showPrevious: boolean}}
     */
    function getInfiniteHitsWidget(search) {
        return {
            container     : '#instant-search-results-container',
            templates     : {
                empty       : '<div></div>',
                item        : getTemplateContentsFromDOM('#instant-hit-template'),
                showMoreText: algoliaConfig.translations.showMore,
            },
            cssClasses    : {
                loadPrevious: ['action', 'primary'],
                loadMore    : ['action', 'primary'],
            },
            transformItems: function (items) {
                return items.map(function (item) {
                    item.__indexName = search.helper.lastResults.index;
                    item = window.transformHit(item, algoliaConfig.priceKey, search.helper);
                    item.isAddToCartEnabled = algoliaConfig.instant.isAddToCartEnabled;
                    return item;
                });
            },
            showPrevious  : true,
            escapeHits    : true,
        };
    }

    /**
     * searchBox
     * Docs: https://www.algolia.com/doc/api-reference/widgets/search-box/js/
     *
     * @returns {{container: string, showSubmit: boolean, placeholder: *, queryHook: (function(*, *): *)}}
     */
    function getSearchBoxWidget() {
        return {
            container  : '#instant-search-bar',
            placeholder: algoliaConfig.translations.searchFor,
            showSubmit : false,
            queryHook  : (inputValue, search) => {
                hasInteracted = true;
                if (
                    algoliaConfig.isSearchPage &&
                    !algoliaConfig.request.categoryId &&
                    !algoliaConfig.request.landingPageId.length
                ) {
                    const el = document.querySelector('h1.page-title');
                    if (el) {
                        el.innerHTML =
                            algoliaConfig.translations.searchTitle +
                            ": '" +
                            window.algolia.htmlspecialcharsEncode(inputValue) +
                            "'";
                    }
                }
                return search(inputValue);
            },
        };
    }

    /**
     * stats
     * Docs: https://www.algolia.com/doc/api-reference/widgets/stats/js/
     *
     * @param templateProcessor
     * @returns {{container: string, templates: {text: (function(*): *)}}}
     */
    function getStatsWidget(templateProcessor) {
        return {
            container: '#algolia-stats',
            templates: {
                text: (data) => {
                    data.first = data.page * data.hitsPerPage + 1;
                    data.last = Math.min(
                        data.page * data.hitsPerPage + data.hitsPerPage,
                        data.nbHits
                    );
                    data.seconds = data.processingTimeMS / 1000;
                    data.translations = window.algoliaConfig.translations;

                    const template = getTemplateContentsFromDOM('#instant-stats-template');
                    return templateProcessor.process(template, data);
                },
            },
        }
    }

    /**
     * sortBy
     * Docs: https://www.algolia.com/doc/api-reference/widgets/sort-by/js/
     *
     * @returns {{container: string, items: *}}
     */
    function getSortByWidget() {
        return {
            container: '#algolia-sorts',
            items    : algoliaConfig.sortingIndices.map((sortingIndice) => {
                return {
                    label: sortingIndice.label,
                    value: sortingIndice.name,
                };
            }),
        };
    }

    ////////////////////////////
    //        FACETS          //
    ////////////////////////////

    /**
     * Add all facet widgets to allWidgetConfiguration
     * This is dynamically driven by the Magento facet configuration
     * Invokes facet builder function by attribute or type (where attribute builders take precedence)
     * The builders are responsible for flushing out the widget configuration for each facet
     *
     * @param allWidgetConfiguration
     * @returns {*}
     */
    function configureFacets(allWidgetConfiguration) {
        const customFacetBuilders = getCustomAttributeFacetBuilders();

        const wrapper = document.getElementById('instant-search-facets-container');
        algoliaConfig.facets.forEach(
            facet => {
                facet.wrapper = wrapper;

                if (facet.attribute.includes('price')) {
                    facet.attribute += algoliaConfig.priceKey;
                }

                const facetBuilder = customFacetBuilders[facet.attribute] ?? getFacetConfig.bind(this);

                const widgetInfo = facetBuilder(facet);

                const [widgetType, widgetConfig] = widgetInfo;

                if (allWidgetConfiguration.hasOwnProperty(widgetType)) {
                    allWidgetConfiguration[widgetType].push(widgetConfig);
                } else {
                    allWidgetConfiguration[widgetType] = [widgetConfig];
                }
            }
        );

        return allWidgetConfiguration;
    }

    ////////////////////////////
    //     Facets by TYPE     //
    ////////////////////////////

    /**
     * This is a generic facet builder that builds a widget config by facet *TYPE*
     * (Defined facet types are Magento specific and not valid InstantSearch widget types)
     *
     * Function must return an array [<widget name>: string, <widget options>: object]
     * (Same objects in array returned by implementations of `getCustomAttributeFacetBuilders()`)
     *
     * @param facet
     * @returns {[string,Object]} The second element in the array is a config for a *facet*
     *     The config contains regular IS widget specific details + `panelOptions`
     *     Although extra object properties are silently ignored it is important to distinguish these
     *     objects as they must be processed further before passing directly to InstantSearch
     *
     * @see getCustomAttributeFacetBuilders
     */
    function getFacetConfig(facet) {
        switch (facet.type) {
            case 'priceRanges':
                return getRangeInputFacetConfig(facet);
            case 'conjunctive':
                return getConjunctiveFacetConfig(facet);
            case 'disjunctive':
                return getDisjunctiveFacetConfig(facet);
            case 'slider':
                return getRangeSliderFacetConfig(facet);
        }

        throw new Error(`[Algolia] Invalid facet widget type: ${facet.type}`);
    }

    /**
     * Return DOM container for the facet
     * If dynamic widgets are enabled no container needs to be created
     *
     * @param facet
     * @returns {*|ActiveX.IXMLDOMNode|null}
     */
    function getFacetContainer(facet) {
        return !algoliaConfig.instant.isDynamicFacetsEnabled
            && facet.wrapper.appendChild(window.createISWidgetContainer(facet.attribute))
            || null;
    }

    /**
     * Docs: https://www.algolia.com/doc/api-reference/widgets/range-input/js/
     */
    function getRangeInputFacetConfig(facet) {
        return [
            'rangeInput',
            {
                container   : getFacetContainer(facet),
                attribute   : facet.attribute,
                templates   : {
                    separatorText: algoliaConfig.translations.to,
                    submitText   : algoliaConfig.translations.go,
                },
                cssClasses  : {
                    root: 'conjunctive',
                },
                panelOptions: getPricingFacetPanelOptions(facet)
            },
        ];
    }

    /**
     * Docs: https://www.algolia.com/doc/api-reference/widgets/range-slider/js/
     */
    function getRangeSliderFacetConfig(facet) {
        return [
            'rangeSlider',
            {
                container   : getFacetContainer(facet),
                attribute   : facet.attribute,
                pips        : false,
                panelOptions: getPricingFacetPanelOptions(facet),
                tooltips    : {
                    format(value) {
                        return facet.attribute.match(/price/) === null
                            ? parseInt(value)
                            : hyva.formatPrice(
                                value,
                                false,
                                algoliaConfig.priceFormat
                            );
                    },
                },
            },
        ];
    }

    function getPricingFacetPanelOptions(facet) {
        return {
            templates: getDefaultFacetPanelTemplates(facet),
            hidden(options) {
                return options.range.min === options.range.max;
            }
        }
    }

    /**
     * Docs: https://www.algolia.com/doc/api-reference/widgets/refinement-list/js/
     */
    function getConjunctiveFacetConfig(facet) {
        const defaultOptions = getRefinementListOptions(facet);

        const refinementListOptions = {
            ...defaultOptions,
            operator    : 'and',
            cssClasses  : {
                root: 'conjunctive',
            }
        };

        return ['refinementList', addSearchForFacetValues(facet, refinementListOptions)];
    }

    /**
     * Docs: https://www.algolia.com/doc/api-reference/widgets/refinement-list/js/
     */
    function getDisjunctiveFacetConfig(facet) {
        const defaultOptions = getRefinementListOptions(facet);

        const refinementListOptions = {
            ...defaultOptions,
            operator    : 'or',
            cssClasses  : {
                root: 'disjunctive',
            }
        }

        return ['refinementList', addSearchForFacetValues(facet, refinementListOptions)];
    }

    function getRefinementListOptions(facet) {
        const options = {
            container   : getFacetContainer(facet),
            attribute   : facet.attribute,
            limit       : algoliaConfig.maxValuesPerFacet,
            templates   : getRefinementsListTemplates(),
            panelOptions: getRefinementFacetPanelOptions(facet)
        };
        if (!algoliaConfig.instant.isDynamicFacetsEnabled) {
            options['sortBy'] = getFacetSortBy()
        }
        return options;
    }

    function getFacetSortBy() {
        return ['count:desc', 'name:asc'];
    }

    function getRefinementFacetPanelOptions(facet) {
        return  {
            templates: getDefaultFacetPanelTemplates(facet),
            hidden: (options) => {
                if (!options.results) return true;

                const facetSearch = f => f.name === facet.attribute;

                switch (facet.type) {
                    case 'conjunctive':
                        return !options.results.facets.find(facetSearch);
                    case 'disjunctive':
                        return !options.results.disjunctiveFacets.find(facetSearch);
                    default:
                        return false;
                }
            },
        };
    }

    function getDefaultFacetPanelTemplates(facet) {
        return {
            header: `<div class="name">${facet.label || facet.attribute}</div>`,
        };
    }

    function addSearchForFacetValues(facet, options) {
        if (facet.searchable === '1') {
            options.searchable = true;
            options.searchableIsAlwaysActive = false;
            options.searchablePlaceholder =
                algoliaConfig.translations.searchForFacetValuesPlaceholder;
            options.templates = options.templates || {};
            options.templates.searchableNoResults =
                `<div class="sffv-no-results">${algoliaConfig.translations.noResults}</div>`;
        }

        return options;
    }

    /**
     * @returns {{item: string}}
     */
    function getRefinementsListTemplates() {
        return {
            item: getTemplateContentsFromDOM('#refinements-lists-item-template')
        };
    }

    ////////////////////////////
    //  Facets by ATTRIBUTE   //
    ////////////////////////////

    /**
     * Here are specified custom attributes widgets which require special code to run properly
     * The facet builder returns by *ATTRIBUTE*
     * Generic facets by *type* are built by getFacetConfig()
     *
     * Custom widgets can be added to this object like [attribute]: function(facet)
     * Function must return an array [<widget name>: string, <widget options>: object]
     * (Same as getFacetConfig() which handles generic facets)
     *
     * Any facet builders returned by this function will take precedence over getFacetConfig()
     *
     * Triggers the hook: beforeFacetInitialization
     *
     * @returns {Object<string, function>}
     * @see getFacetConfig
     */
    function getCustomAttributeFacetBuilders() {
        const builders = {
            categories: getCategoriesFacetConfigBuilder()
        };

        return window.algolia.triggerHooks(
            'beforeFacetInitialization',
            builders
        );
    }

    /**
     * Get custom attribute function to generate config to ultimately build a categories hierarchicalMenu widget
     *
     * Docs: https://www.algolia.com/doc/api-reference/widgets/hierarchical-menu/js/
     */
    function getCategoriesFacetConfigBuilder() {
        return (facet) => {
            const hierarchical_levels = [];
            for (let l = 0; l < 10; l++) {
                hierarchical_levels.push('categories.level' + l.toString());
            }

            const hierarchicalMenuParams = {
                container      : getFacetContainer(facet),
                attributes     : hierarchical_levels,
                separator      : algoliaConfig.instant.categorySeparator,
                templates      : [],
                showParentLevel: true,
                limit          : algoliaConfig.maxValuesPerFacet,
                sortBy         : ['name:asc'],
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
                        })
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
                    header:
                        '<div class="name">' +
                        (facet.label ? facet.label : facet.attribute) +
                        '</div>',
                },
                hidden   : function ({items}) {
                    return !items.length;
                },
            };

            return ['hierarchicalMenu', hierarchicalMenuParams];
        };
    }

    ////////////////////////////
    //      Refinements       //
    ////////////////////////////

    /**
     * Setup attributes for current refinements widget
     * @returns {*[]}
     */
    function getCurrentRefinementsAttributes() {
        const attributes = [];
        algoliaConfig.facets.forEach(
            facet => {
                let name = facet.attribute;

                if (name === 'categories') {
                    name = 'categories.level0';
                }

                if (name === 'price') {
                    name = facet.attribute + algoliaConfig.priceKey;
                }

                attributes.push({
                    name : name,
                    label: facet.label ? facet.label : facet.attribute,
                });
            }
        );
        return attributes;
    }

    /**
     * Loads refinements management capabilities
     * i.e. As refinements are applied to search results via faceting,
     * this feature allows you to selectively remove one or all refinements.
     *
     * @param allWidgetConfiguration
     * @returns {*}
     */
    function configureRefinements(allWidgetConfiguration) {
        const currentRefinementsAttributes = getCurrentRefinementsAttributes();
        allWidgetConfiguration.currentRefinements = getCurrentRefinementsWidget(currentRefinementsAttributes);
        allWidgetConfiguration.clearRefinements = getClearRefinementsWidget(currentRefinementsAttributes);
        return allWidgetConfiguration;
    }

    /**
     * currentRefinements
     * Widget displays all filters and refinements applied on query. It also let your customer to clear them one by one
     * Docs: https://www.algolia.com/doc/api-reference/widgets/current-refinements/js/
     *
     * @param currentRefinementsAttributes
     * @returns {{container: string, transformItems: (function(*): *), includedAttributes: *}}
     */
    function getCurrentRefinementsWidget(currentRefinementsAttributes) {
        return {
            container: '#current-refinements',
            includedAttributes: currentRefinementsAttributes.map((attribute) => {
                if (
                    attribute.name.indexOf('categories') === -1 ||
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
        };
    }

    /**
     * clearRefinements
     * Widget displays a button that lets the user clean every refinement applied to the search. You can control which attributes are impacted by the button with the options.
     * Docs: https://www.algolia.com/doc/api-reference/widgets/clear-refinements/js/
     *
     * @param currentRefinementsAttributes
     * @returns {{container: string, cssClasses: {button: string[]}, transformItems: (function(*): *), templates: {resetLabel: (string|*)}, includedAttributes: *}}
     */
    function getClearRefinementsWidget(currentRefinementsAttributes) {
        return {
            container         : '#clear-refinements',
            templates         : {
                resetLabel: algoliaConfig.translations.clearAll,
            },
            includedAttributes: currentRefinementsAttributes.map(function (attribute) {
                if (
                    !(
                        algoliaConfig.isCategoryPage &&
                        attribute.name.indexOf('categories') > -1
                    )
                ) {
                    return attribute.name;
                }
            }),
            cssClasses        : {
                button: ['action', 'primary'],
            },
            transformItems    : function (items) {
                return items.map(function (item) {
                    const attribute = currentRefinementsAttributes.filter(function (_attribute) {
                        return item.attribute === _attribute.name;
                    })[0];
                    if (!attribute) return item;
                    item.label = attribute.label;
                    return item;
                });
            },
        };
    }

    ////////////////////////////
    //     Custom widgets     //
    ////////////////////////////

    /**
     * Return an array of custom widgets
     * Docs: https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js/
     *
     * @returns {({init(*): void, getWidgetSearchParameters(*): *, render(*): void})[]}
     */
    function getCustomWidgets() {
        const customWidgets = [ getInitializeResultsWidget() ];
        if (algoliaConfig.showSuggestionsOnNoResultsPage) {
            customWidgets.push(getSuggestionsWidget(minQuerySuggestions));
        }

        if (algoliaConfig.instant.redirects.enabled) {
            customWidgets.push(getRedirectWidget());
        }
        return customWidgets;
    }

    /**
     * Custom widget - this widget is used to refine results for search page or catalog page
     * Docs: https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js/
     *
     * @returns {{init(*): void, getWidgetSearchParameters(*): (*), render(*): void}|*}
     */
    function getInitializeResultsWidget() {
        return {
            getWidgetSearchParameters(searchParameters) {
                if (
                    algoliaConfig.request.query.length > 0 &&
                    location.hash.length < 1
                ) {
                    return searchParameters.setQuery(
                        window.algolia.htmlspecialcharsDecode(algoliaConfig.request.query)
                    );
                }
                return searchParameters;
            },
            init(data) {
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
            }
        };
    }

    /**
     * Custom widget - Suggestions
     * This widget renders suggestion queries which might be interesting for your customer
     * Docs: https://www.algolia.com/doc/guides/building-search-ui/widgets/create-your-own-widgets/js/
     *
     * @param {number} minQuerySuggestions - postive integer for number of suggestions to display
     * @returns {{init(): void, suggestions: *[], render(*): void}}
     */
    function getSuggestionsWidget(minQuerySuggestions) {
        return {
            suggestions: [],
            init() {
                algoliaConfig.popularQueries.slice(
                    0,
                    Math.min(minQuerySuggestions, algoliaConfig.popularQueries.length)
                ).forEach(
                    (query) => {
                        query = window.algolia.htmlspecialcharsEncode(query);
                        this.suggestions.push(
                            `<a href="${algoliaConfig.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}">${query}</a>`
                        );
                    }
                );
            },
            render(data) {
                let content = '';
                if (data.results.hits.length === 0) {
                    const query = window.algolia.htmlspecialcharsEncode(data.results.query);
                    content = `<div class="no-results">`;
                    content += `<div><strong>${algoliaConfig.translations.noProducts} "${query}"</strong></div>`;
                    content += `<div class="popular-searches">`;
                    content += `<div>${algoliaConfig.translations.popularQueries}</div>`;
                    content += this.suggestions.join(', ');
                    content += `</div>`;
                    content += algoliaConfig.translations.or;
                    content += `<a href="${algoliaConfig.baseUrl}/catalogsearch/result/?q=__empty__">${algoliaConfig.translations.seeAll}</a>`;
                    content += `</div>`;
                }
                document.querySelector('#instant-empty-results-container').innerHTML = content;
            },
        };
    }

    function isAbleToRedirect() {
        return (
            !hasInteracted && algoliaConfig.instant.redirects.onPageLoad
            ||
            hasInteracted && algoliaConfig.instant.redirects.onSearchAsYouType
        );
    }

    function getSelectableRedirect(results) {
        let content = `<div class="instant-redirect">`;
        content += `<a href="${results.renderingContent.redirect.url}"`;
        if (algoliaConfig.instant.redirects.openInNewWindow) {
            content += ` target="_blank"`;
        }
        content += `>${algoliaConfig.translations.redirectSearchPrompt} "${results.query}"</a>`;
        content += `</div>`;
        return content;
    }

    function getRedirectWidget() {
        return {
            render: ({ results }) => {
                let content = '';
                if (results && results.renderingContent) {
                    if (results.renderingContent.redirect) {
                        if (isAbleToRedirect()) {
                            window.location.assign(results.renderingContent.redirect.url);
                        }

                        if (algoliaConfig.instant.redirects.showSelectableRedirect) {
                            content = getSelectableRedirect(results);
                        }
                    }
                }
                document.querySelector('#instant-redirect-container').innerHTML = content;
            },
        };
    }

    ////////////////////////////
    //     Merchandising      //
    ////////////////////////////

    /**
     * queryRuleCustomData
     * The queryRuleCustomData widget displays custom data from Query Rules.
     * Docs: https://www.algolia.com/doc/api-reference/widgets/query-rule-custom-data/js/
     *
     * @returns {{container: string, templates: {default: string}}}
     */
    function getQueryRuleCustomDataWidget() {
        return {
            container: '#algolia-banner',
            templates: {
                default: '{{#items}} {{#banner}} {{{banner}}} {{/banner}} {{/items}}',
            },
        };
    }

    ////////////////////////////
    //      Configuration     //
    ////////////////////////////

    /**
     * Get the configuration options for creating the InstantSearch object
     * Docs: https://www.algolia.com/doc/api-reference/widgets/instantsearch/js/#options
     *
     * Triggers the hook: beforeInstantsearchInit
     *
     * @param mockAlgoliaBundle to be removed in a future release
     * @returns {*}
     */
    function getInstantSearchOptions(mockAlgoliaBundle = {}) {
        return window.algolia.triggerHooks(
            'beforeInstantsearchInit',
            {
                searchClient: getSearchClient(),
                indexName   : getProductIndexName(),
                routing     : window.routing,
            },
            mockAlgoliaBundle
        );
    }

    /**
     * Initialize search client
     */
    function getSearchClient() {
        return algoliasearch(algoliaConfig.applicationId, algoliaConfig.apiKey);
    }

    /**
     * Get raw search parameters for configure widget
     * See https://www.algolia.com/doc/api-reference/widgets/configure/js/
     * @returns {*[]}
     */
    function getSearchParameters() {
        const searchParameters = {
            hitsPerPage : algoliaConfig.hitsPerPage,
            ruleContexts: getRuleContexts()
        };

        if (
            algoliaConfig.request.path.length &&
            window.location.hash.indexOf('categories.level0') === -1
        ) {
            if (!algoliaConfig.areCategoriesInFacets) {
                searchParameters['facetsRefinements'] = {};
                searchParameters['facetsRefinements'][
                'categories.level' + algoliaConfig.request.level
                    ] = [algoliaConfig.request.path];
            }
        }

        if (
            algoliaConfig.instant.isVisualMerchEnabled &&
            algoliaConfig.isCategoryPage
        ) {
            searchParameters.filters = `${
                algoliaConfig.instant.categoryPageIdAttribute
            }:"${algoliaConfig.request.path.replace(/"/g, '\\"')}"`;
        }

        return searchParameters;
    }

    ////////////////////////////
    //    Utility functions   //
    ////////////////////////////

    function getProductIndexName() {
        return algoliaConfig.indexName + '_products';
    }

    /**
     * NOTE: The initial (relevant) sort is based on the main index
     */
    function prepareSortingIndices() {
        algoliaConfig.sortingIndices.unshift({
            name : getProductIndexName(),
            label: algoliaConfig.translations.relevance,
        });
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

        if (!document.querySelector(algoliaConfig.instant.selector)) {
            throw new Error(
                `[Algolia] Invalid instant-search selector: ${algoliaConfig.instant.selector}`
            );
        }

        if (
            algoliaConfig.autocomplete.enabled &&
            document.querySelector(algoliaConfig.instant.selector)
                .querySelector(algoliaConfig.autocomplete.selector)
        ) {
            throw new Error(
                `[Algolia] You can't have a search input matching "${algoliaConfig.autocomplete.selector}" ` +
                `inside your instant selector "${algoliaConfig.instant.selector}"`
            );
        }

        return true;
    }

    /**
     * @returns {string}
     */
    function getAlgoliaAgent() {
        return 'Magento2 integration (' + algoliaConfig.extensionVersion + ')';
    }

    /**
     * @param selector
     * @returns {string}
     */
    function getTemplateContentsFromDOM(selector) {
        const element = document.querySelector(selector);
        if (element) return element.innerHTML;

        throw new Error(`[Algolia] Invalid template selector: ${selector}`);
    }

    /**
     * @returns {string[]}
     */
    function getRuleContexts() {
        const ruleContexts = [algoliaConfig.request.ruleContexts.facetFilters, '']; // Empty context to keep BC for already create rules in dashboard
        if (algoliaConfig.request.categoryId.length) {
            ruleContexts.push(algoliaConfig.request.ruleContexts.merchCategoryPrefix + algoliaConfig.request.categoryId);
        }

        if (algoliaConfig.request.landingPageId.length) {
            ruleContexts.push(algoliaConfig.request.ruleContexts.landingPagePrefix + algoliaConfig.request.landingPageId);
        }
        return ruleContexts;
    }

    /**
     * Capture active redirect URL with IS facet params for add to cart from PLP
     * @param search
     */
    function handleAddToCart(search) {
        search.on('render', () => {
            const cartForms = document.querySelectorAll(
                '[data-role="tocart-form"]'
            );
            cartForms.forEach((form) => {
                form.addEventListener('submit', e => {
                    const url = `${algoliaConfig.request.url}${window.location.search}`;
                    e.target.elements[
                        algoliaConfig.instant.addToCartParams.redirectUrlParam
                        ].value = window.AlgoliaBase64.mageEncode(url);
                });
            });
        });
    }

    function addMobileRefinementsToggle() {
        const refineToggle = document.getElementById('refine-toggle');
        const facetsContainer = document.getElementById('instant-search-facets-container');

        if (refineToggle && facetsContainer) {
            refineToggle.addEventListener('click', function () {
                facetsContainer.classList.toggle('hidden-sm');
                facetsContainer.classList.toggle('hidden-xs');

                const currentText = this.innerHTML.trim();
                if (currentText[0] === '+') {
                    this.innerHTML = '- ' + algoliaConfig.translations.refine;
                } else {
                    this.innerHTML = '+ ' + algoliaConfig.translations.refine;
                }
            });
        }
    }

    ///////////////////////////
    //       Deprecated      //
    ///////////////////////////

    /**
     * @deprecated Preserved for backward compat but this widget uses Universal Analytics which was sunsetted July 1, 2023
     * TODO: Introduce GA4
     */
    function getAnalyticsWidget() {
        return {
            pushFunction(formattedParameters, state, results) {
                const trackedUrl =
                    '/catalogsearch/result/?q=' +
                    state.query +
                    '&' +
                    formattedParameters +
                    '&numberOfHits=' +
                    results.nbHits;

                if (typeof window.ga !== 'undefined') {
                    window.ga('set', 'page', trackedUrl);
                    window.ga('send', 'pageView');
                }
            },
            delay                 : algoliaConfig.analytics.delay,
            triggerOnUIInteraction: algoliaConfig.analytics.triggerOnUiInteraction,
            pushInitialSearch     : algoliaConfig.analytics.pushInitialSearch,
        };
    }

    /**
     * @deprecated This method has been renamed - as the method does not return a true widget
     *             but rather an integration specific config structure that also contains `panelOptions`
     *
     *             The `templates` parameter is also now no longer used
     * @see getFacetConfig
     */
    function getFacetWidget(facet, _templates) {
        return getFacetConfig(facet);
    }

    /**
     * @deprecated algoliaBundle is going away!
     * This mock only includes libraries available to this module
     * The following have been removed:
     *  - Hogan
     *  - algoliasearchHelper
     *  - autocomplete
     *  - createAlgoliaInsightsPlugin
     *  - createLocalStorageRecentSearchesPlugin
     *  - createQuerySuggestionsPlugin
     *  - getAlgoliaResults
     * However if you've used or require any of these additional libs in your customizations,
     * you can either augment this mock as you need or include the global dependency in your module
     * and make it available to your hook.
     */
    function mockAlgoliaBundle() {
        return {
            algoliasearch: window.algoliasearch,
            instantsearch: window.instantsearch
        }
    }

    /**
     * @deprecated - these old hooks are scheduled to be removed in version 3.17
     */
    function invokeLegacyHooks() {
        if (typeof algoliaHookBeforeInstantsearchInit === 'function') {
            window.registerHook(
                'beforeInstantsearchInit',
                algoliaHookBeforeInstantsearchInit
            );
        }

        if (typeof algoliaHookBeforeWidgetInitialization === 'function') {
            window.registerHook(
                'beforeWidgetInitialization',
                algoliaHookBeforeWidgetInitialization
            );
        }

        if (typeof algoliaHookBeforeInstantsearchStart === 'function') {
            window.registerHook(
                'beforeInstantsearchStart',
                algoliaHookBeforeInstantsearchStart
            );
        }

        if (typeof algoliaHookAfterInstantsearchStart === 'function') {
            window.registerHook(
                'afterInstantsearchStart',
                algoliaHookAfterInstantsearchStart
            );
        }
    }

    // Initialize the Algolia InstantSearch
    initialize();
}
