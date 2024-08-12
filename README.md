# hyva-algolia-search

[![Latest Stable Version](https://img.shields.io/badge/version-2.0.1-blue)](https://packagist.org/packages/blackbird/module-hyva-algolia-search)
[![License: MIT](https://img.shields.io/github/license/blackbird-agency/hyva-splide-js.svg)](./LICENSE)

Compat module for Algolia Search on Magento 2 using Hyvä Themes. This requires:
- A [Hyvä Themes](https://www.hyva.io/) key
- Access to Algolia
- [blackbird/external-ressource-loader](https://github.com/blackbird-agency/external-resources-loader) to dynamically load all the Algolia ressources. 

## Setup

Get the package

Composer Package:
```composer require blackbird/module-hyva-algolia-search```

Zip Package:
Unzip the package in app/code/Blackbird/HyvaAlgoliaSearch, from the root of your Magento instance.

## Install the module

Go to your Magento root directory and run the following magento command:

```
php bin/magento setup:upgrade
```

**If you are in production mode, do not forget to recompile and redeploy the static resources, or use the `--keep-generated` option.**

Once the module is installed, please run the following command to generate the updated `app/etc/hyva-themes.json` file as per [official documentation](https://docs.hyva.io/hyva-themes/compatibility-modules/tailwind-source-css-merging.html#1-create-the-tailwind-sourcecss-file):

```
bin/magento hyva:config:generate
```

Depending on how the module has been installed, the following line must be now present in the `app/etc/hyva-themes.json` file.

### Installed using composer

```
{
  "extensions": [
    ...
    {
      "src": "vendor\/blackbird\/module-hyva-algolia-search"
    },
    ...
  ]
}
```

### Installed using a Zip package

```
{
  "extensions": [
    ...
    {
      "src": "app\/code\/Blackbird\/HyvaAlgoliaSearch"
    },
    ...
  ]
}
```

## What's included

This compat modules offers full Hyvä-compatibility for the following Algolia services:
- Algolia Search
- Algolia InstantSearch
- Algolia Recommend
- Algolia Autocomplete
- Algolia Insights

Default styling is heavily inspired by the native theme of Hyvä Themes. Most style classes are used directly in the relevent templates or in the overridable `tailwind-source.css` file located in the `view/frontend/tailwind/` directory.
Compare and wishlist feature has been reported.

## Known issues, limitations

- As of now, the Ajax add to basket feature has been implemented within a limited scope. Simple products have the quick ATB option but configurable products are **forwarded to the product page**.
- The native Hyvä Themes implementation of the option selection on a product tile **has not** been integrated yet.
