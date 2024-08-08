<?php
/**
 * TrendsItem
 *
 * @copyright Copyright © 2023 Blackbird. All rights reserved.
 * @author    emilie (Blackbird Team)
 */
declare(strict_types=1);


namespace Blackbird\HyvaAlgoliaSearch\Block\Widget;


use Algolia\AlgoliaSearch\Block\Widget\TrendsItem as TrendsItemOrig;

class TrendsItem extends TrendsItemOrig
{
    protected $_template = 'Blackbird_HyvaAlgoliaSearch::recommend/widget/trends-item.phtml';
}
