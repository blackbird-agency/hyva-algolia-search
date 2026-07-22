<?php
/**
 * Form
 *
 * @copyright Copyright © 2023 Blackbird. All rights reserved.
 * @author    emilie (Blackbird Team)
 */
declare(strict_types=1);


namespace Blackbird\HyvaAlgoliaSearch\ViewModel;

use Algolia\AlgoliaSearch\Block\Configuration;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Framework\View\Element\Block\ArgumentInterface;

class InstantSearchViewModel implements ArgumentInterface
{
    /**
     * @param \Magento\Framework\View\Asset\Repository $assetRepository
     * @param \Algolia\AlgoliaSearch\Block\Configuration $configuration
     * @param \Magento\Framework\Serialize\Serializer\Json $json
     */
    public function __construct(
        protected AssetRepository $assetRepository,
        protected Configuration $configuration,
        protected Json $json
    ) {
    }

    /**
     * @param string $asset
     * @return string
     */
    public function getAssetUrl(string $asset): string
    {
        return $this->assetRepository->getUrl($asset);
    }

    /**
     * @return array
     */
    public function getJsConfigData(): array
    {
        return $this->getAlgoliaConfiguration();
    }

    /**
     * @return string
     */
    public function getJsConfig(): string
    {
        $result = $this->json->serialize($this->getJsConfigData());

        return is_string($result) ? $result : '';
    }

    /**
     * @return array
     */
    public function getInstantsearchScripts(): array
    {
        return
            array_merge(
                $this->getAlgoliaScripts(),
                [
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/hogan.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/mustache.min.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/internals/template-engine.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/instantsearch.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/algolia-search.min.js'),
                ]
            );
    }

    /**
     * @return array
     */
    public function getAlgoliaScripts(): array
    {
        return [
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/internals/common.js'),
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/internals/base64.js'),
            $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/algolia-instantsearch.min.js'),
            $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/search-insights.min.js'),
        ];
    }

    /**
     * @return array
     */
    protected function getAlgoliaConfiguration(): array
    {
        return (array)$this->configuration->getConfiguration();
    }

    /**
     * @return array
     */
    public function getRecommendedScripts(): array
    {
        return
            array_merge(
                $this->getAlgoliaScripts(),
                [
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/recommend.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/recommend-js.min.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/recommend.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/recommend/products.js')
                ]
            );
    }

    /**
     * @return array
     */
    public function getRecommendedTrendsScripts(): array
    {
        return
            array_merge(
                $this->getAlgoliaScripts(),
                [
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/recommend.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/recommend-js.min.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/recommend-trends.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/recommend/products.js')
                ]
            );
    }
    /**
     * @return array
     */
    public function getRecommendedLSScripts(): array
    {
        return
            array_merge(
                $this->getAlgoliaScripts(),
                [
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/recommend.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/recommend-js.min.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/recommend-LS.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/recommend/products.js')
                ]
            );
    }



    /**
     * @return array
     */
    public function getAutocompleteScripts(): array
    {
        return
            array_merge(
                $this->getAlgoliaScripts(),
                [
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/algolia-search.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/autocomplete/algolia-autocomplete.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/autocomplete/insights-plugin.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/autocomplete/query-suggestions-plugin.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/autocomplete/recent-searches-plugin.min.js'),
                    $this->getAssetUrl('Algolia_AlgoliaSearch::js/lib/autocomplete/redirect-url-plugin.min.js'),
                    $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/autocomplete.js')
                ],
                $this->getAutocompleteTemplateScripts()
            );
    }

    /**
     * @return array
     */
    public function getAutocompleteTemplateScripts(): array
    {
        return [
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/autocomplete/additional-section.js'),
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/autocomplete/categories.js'),
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/autocomplete/pages.js'),
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/autocomplete/products.js'),
            $this->getAssetUrl('Blackbird_HyvaAlgoliaSearch::js/template/autocomplete/suggestions.js')
        ];
    }
}
