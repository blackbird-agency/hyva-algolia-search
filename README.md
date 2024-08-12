# hyva-algolia-search
Compat module for Algolia Search on Magento 2 using Hyvä Themes. This uses [blackbird/external-ressource-loader](https://github.com/blackbird-agency/external-resources-loader) to dynamically load all the Algolia ressources. 

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
