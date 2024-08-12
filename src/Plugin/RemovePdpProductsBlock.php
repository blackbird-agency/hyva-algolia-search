<?php
/**
 * RemovePdpProductsBlock
 *
 * @copyright Copyright © 2023 Blackbird. All rights reserved.
 * @author    emilie (Blackbird Team)
 */
declare(strict_types=1);


namespace Blackbird\HyvaAlgoliaSearch\Plugin;


use Algolia\AlgoliaSearch\Helper\ConfigHelper;
use Magento\Framework\View\Element\AbstractBlock;

class RemovePdpProductsBlock
{
    const RELATED_BLOCK_NAME = 'related';
    const UPSELL_BLOCK_NAME = 'upsell';

    public function __construct(
        protected ConfigHelper $_configHelper
    ) {
    }

    /**
     * @param AbstractBlock $subject
     * @param $result
     *
     * @return mixed|string
     */
    public function afterToHtml(AbstractBlock $subject, $result)
    {
        if (($subject->getNameInLayout() === self::RELATED_BLOCK_NAME && $this->_configHelper->isRecommendRelatedProductsEnabled() && $this->_configHelper->isRemoveCoreRelatedProductsBlock()) || ($subject->getNameInLayout() === self::UPSELL_BLOCK_NAME && $this->_configHelper->isRecommendFrequentlyBroughtTogetherEnabled() && $this->_configHelper->isRemoveUpsellProductsBlock())) {
            return '';
        }

        return $result;
    }
}
