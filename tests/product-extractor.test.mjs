import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichBirkenstockProductWithVariation,
  enrichGuProductWithInventory,
  enrichShopifyProductWithVariants,
  getBirkenstockVariationUrl,
  getGuInventoryUrl,
  getMulebuySourceUrl,
  getShopifyProductJsonUrl,
  isSafePublicUrl,
  keepMulebuyProductLink,
  normalizeProductUrl,
  parseProductHtml,
  statusForSize,
} from "../lib/product-extractor.ts";
import { productFromRow, productToRow } from "../lib/product-storage.ts";

test("normalizes tracking parameters while preserving product options", () => {
  assert.equal(
    normalizeProductUrl("https://shop.example/products/tee?utm_source=instagram&color=blue#details"),
    "https://shop.example/products/tee?color=blue",
  );
  assert.equal(
    normalizeProductUrl("https://shop.example/products/tee?_su_rec=abc&_su_rec_id=123&variant=blue"),
    "https://shop.example/products/tee?variant=blue",
  );
});

test("resolves a Mulebuy Weidian link and reads its original CNY variants", () => {
  const mulebuyUrl = "https://mulebuy.com/product?id=7779563335&platform=WEIDIAN";
  const weidianUrl = "https://weidian.com/item.html?itemID=7779563335";
  assert.equal(getMulebuySourceUrl(mulebuyUrl), weidianUrl);

  const payload = {
    result: {
      default_model: {
        item_info: {
          itemLowPrice: 41000,
          item_head: "https://si.geilicdn.com/green-jacket.jpg",
          item_name: "Green jacket",
          stock: 12,
        },
        shop_info: { shopName: "çç§å®å¶" },
        sku_properties: {
          attr_list: [{
            attr_title: "size",
            attr_values: [
              { attr_id: 1, attr_value: "S", img: "" },
              { attr_id: 2, attr_value: "M", img: "" },
              { attr_id: 3, attr_value: "L", img: "" },
              { attr_id: 4, attr_value: "XL", img: "" },
            ],
          }],
          sku: {
            small: { attr_ids: "1", id: 101, img: "https://si.geilicdn.com/green-jacket.jpg", price: "410.00", stock: 3 },
            medium: { attr_ids: "2", id: 102, img: "https://si.geilicdn.com/green-jacket.jpg", price: "410.00", stock: 4 },
            large: { attr_ids: "3", id: 103, img: "https://si.geilicdn.com/green-jacket.jpg", price: "410.00", stock: 5 },
            xl: { attr_ids: "4", id: 104, img: "https://si.geilicdn.com/green-jacket.jpg", price: "410.00", stock: 0 },
          },
        },
      },
    },
  };
  const encoded = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/"/g, "&#34;");
  const product = parseProductHtml(`<script id="__rocker-render-inject__" data-obj="${encoded}"></script>`, weidianUrl);
  assert.equal(product.title, "Green jacket");
  assert.equal(product.brand, "燃烧定制");
  assert.equal(product.priceCents, 41000);
  assert.equal(product.currency, "CNY");
  assert.equal(product.category, "Outerwear");
  assert.deepEqual(product.sizes.map(({ label, status }) => ({ label, status })), [
    { label: "S", status: "in-stock" },
    { label: "M", status: "in-stock" },
    { label: "L", status: "in-stock" },
    { label: "XL", status: "out-of-stock" },
  ]);

  const mulebuyProduct = keepMulebuyProductLink(product, mulebuyUrl);
  assert.equal(mulebuyProduct.url, mulebuyUrl);
  assert.equal(mulebuyProduct.canonicalUrl, mulebuyUrl);
  assert.equal(mulebuyProduct.retailer, "Mulebuy");
  assert.ok(mulebuyProduct.sizes.every((size) => size.url === mulebuyUrl));
});

test("resolves Mulebuy Taobao, Tmall, and 1688 source links", () => {
  assert.equal(
    getMulebuySourceUrl("https://mulebuy.com/product?id=909340041645&platform=TAOBAO"),
    "https://detail.tmall.com/item.htm?id=909340041645",
  );
  assert.equal(
    getMulebuySourceUrl("https://mulebuy.com/product?id=909340041645&platform=TMALL"),
    "https://detail.tmall.com/item.htm?id=909340041645",
  );
  assert.equal(
    getMulebuySourceUrl("https://mulebuy.com/product?id=1012260586454&platform=ALI_1688&ref=200477819"),
    "https://detail.1688.com/offer/1012260586454.html",
  );
  assert.equal(
    getMulebuySourceUrl("https://mulebuy.com/product?id=1012260586454&platform=1688"),
    "https://detail.1688.com/offer/1012260586454.html",
  );
});

test("rejects local and private product URLs", () => {
  assert.equal(isSafePublicUrl("https://example.com/product"), true);
  assert.equal(isSafePublicUrl("http://localhost:3000/product"), false);
  assert.equal(isSafePublicUrl("http://192.168.1.2/product"), false);
  assert.equal(isSafePublicUrl("file:///etc/passwd"), false);
});

test("extracts product details and variant availability from JSON-LD", () => {
  const html = `<!doctype html><html><head>
    <link rel="canonical" href="https://example.com/products/heavy-tee?utm_campaign=sale">
    <script type="application/ld+json">{
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Heavy Cotton Tee",
      "brand": {"@type":"Brand","name":"North Studio"},
      "image": ["https://cdn.example.com/tee.jpg"],
      "color": "Ink",
      "category": "T-shirts",
      "offers": {"@type":"Offer","price":"48.00","priceCurrency":"USD"},
      "hasVariant": [
        {"@type":"Product","size":"S","offers":{"availability":"https://schema.org/OutOfStock"}},
        {"@type":"Product","size":"M","offers":{"availability":"https://schema.org/InStock"}}
      ]
    }</script></head></html>`;
  const result = parseProductHtml(html, "https://example.com/products/heavy-tee?utm_source=ig");
  assert.equal(result.title, "Heavy Cotton Tee");
  assert.equal(result.brand, "North Studio");
  assert.equal(result.priceCents, 4800);
  assert.equal(result.category, "Tops");
  assert.deepEqual(result.sizes, [
    { label: "S", status: "out-of-stock" },
    { label: "M", status: "in-stock" },
  ]);
  assert.equal(statusForSize(result.sizes, "M", "unknown"), "in-stock");
});

test("builds a reusable color and size matrix from Schema.org ProductGroup variants", () => {
  const html = `<script type="application/ld+json">{
    "@context":"https://schema.org",
    "@type":"ProductGroup",
    "name":"Studio Cargo Pants",
    "brand":{"name":"Common Label"},
    "hasVariant":[
      {"@type":"Product","productID":"black-s","color":"Black","size":"S","image":"https://image.example/black.jpg","url":"/products/cargo?variant=black-s","offers":{"price":"72","priceCurrency":"USD","availability":"https://schema.org/OutOfStock"}},
      {"@type":"Product","productID":"black-m","color":"Black","size":"M","image":"https://image.example/black.jpg","url":"/products/cargo?variant=black-m","offers":{"price":"72","priceCurrency":"USD","availability":"https://schema.org/InStock"}},
      {"@type":"Product","productID":"blue-s","color":{"name":"Slate Blue"},"size":"S","image":"https://image.example/blue.jpg","url":"/products/cargo?variant=blue-s","offers":{"price":"74","priceCurrency":"USD","availability":"https://schema.org/InStock"}},
      {"@type":"Product","productID":"blue-m","color":{"name":"Slate Blue"},"size":"M","image":"https://image.example/blue.jpg","url":"/products/cargo?variant=blue-m","offers":{"price":"74","priceCurrency":"USD","availability":"https://schema.org/OutOfStock"}}
    ]
  }</script>`;
  const result = parseProductHtml(html, "https://shop.example/products/cargo?variant=blue-m");

  assert.equal(result.selectedColor, "Slate Blue");
  assert.equal(result.imageUrl, "https://image.example/blue.jpg");
  assert.equal(result.priceCents, 7400);
  assert.deepEqual(result.sizes, [
    { label: "S", status: "in-stock", variantId: "blue-s", url: "https://shop.example/products/cargo?variant=blue-s" },
    { label: "M", status: "out-of-stock", variantId: "blue-m", url: "https://shop.example/products/cargo?variant=blue-m" },
  ]);
  assert.deepEqual(result.colors?.map((color) => color.label), ["Black", "Slate Blue"]);
});

test("reads WooCommerce color-specific variation stock and images", () => {
  const variations = [
    { variation_id: 11, attributes: { attribute_pa_color: "navy", attribute_pa_size: "small" }, is_in_stock: false, display_price: 59, image: { src: "https://image.example/navy.jpg" } },
    { variation_id: 12, attributes: { attribute_pa_color: "navy", attribute_pa_size: "medium" }, is_in_stock: true, display_price: 59, image: { src: "https://image.example/navy.jpg" } },
    { variation_id: 13, attributes: { attribute_pa_color: "stone", attribute_pa_size: "small" }, is_in_stock: true, display_price: 59, image: { src: "https://image.example/stone.jpg" } },
  ];
  const encoded = JSON.stringify(variations).replaceAll('"', "&quot;");
  const html = `<meta property="og:title" content="Relaxed Trousers"><form class="variations_form" data-product_variations='${encoded}'></form>`;
  const result = parseProductHtml(html, "https://store.example/product/trousers?variation_id=12&attribute_pa_color=navy&attribute_pa_size=medium");

  assert.equal(result.selectedColor, "Navy");
  assert.equal(result.imageUrl, "https://image.example/navy.jpg");
  assert.equal(result.priceCents, 5900);
  assert.deepEqual(result.sizes, [
    { label: "Small", status: "out-of-stock", variantId: "11", url: "https://store.example/product/trousers?attribute_pa_color=navy&attribute_pa_size=small&variation_id=11" },
    { label: "Medium", status: "in-stock", variantId: "12", url: "https://store.example/product/trousers?attribute_pa_color=navy&attribute_pa_size=medium&variation_id=12" },
  ]);
  assert.deepEqual(result.colors?.map((color) => color.label), ["Navy", "Stone"]);
});

test("falls back to open graph product data", () => {
  const html = `<meta property="og:title" content="Everyday Loafer">
    <meta property="og:image" content="https://cdn.example.com/shoe.jpg">
    <meta property="product:price:amount" content="120.00">
    <meta property="product:price:currency" content="USD">`;
  const result = parseProductHtml(html, "https://footwear.example/products/loafer");
  assert.equal(result.title, "Everyday Loafer");
  assert.equal(result.priceCents, 12000);
  assert.equal(result.category, "Shoes");
  assert.equal(result.status, "unknown");
});

test("reads enabled and disabled size controls when structured variants are missing", () => {
  const html = `
    <meta property="og:title" content="Dragon T-Shirt">
    <script type="application/ld+json">{
      "@type":"Product",
      "name":"Dragon T-Shirt",
      "offers":{"price":"0","priceCurrency":"USD"}
    }</script>
    <script type="application/json">{"price":5400,"price_min":5400,"available":true}</script>
    <input class="product-radios__input" type="radio" disabled name="Size" value="XS">
    <input class="product-radios__input" type="radio" name="Size" value="S" checked>
    <input class="product-radios__input" type="radio" name="Size" value="M">
    <input class="product-radios__input" type="radio" disabled name="Size" value="3XL">
  `;
  const result = parseProductHtml(html, "https://example.com/products/dragon-shirt");
  assert.equal(result.priceCents, 5400);
  assert.deepEqual(result.sizes, [
    { label: "XS", status: "out-of-stock" },
    { label: "S", status: "in-stock" },
    { label: "M", status: "in-stock" },
    { label: "3XL", status: "out-of-stock" },
  ]);
});

test("extracts GU product data and enriches its live size inventory", () => {
  const state = {
    pdp: { product: "E359786-000-00" },
    entity: {
      pdpEntity: {
        "E359786-000-00": {
          product: {
            name: "Wide Straight Slacks",
            breadcrumbs: { class: { name: "pants", locale: "Pants" } },
            colors: [
              { displayCode: "06", name: "GRAY" },
              { displayCode: "09", name: "BLACK" },
            ],
            images: {
              main: {
                "06": { image: "https://image.example/gray.jpg" },
                "09": { image: "https://image.example/black.jpg" },
              },
            },
            prices: { promo: { value: 24.9, currency: { code: "USD" } } },
            sizes: [
              { name: "XS", displayCode: "002" },
              { name: "S", displayCode: "003" },
              { name: "M", displayCode: "004" },
            ],
          },
        },
      },
    },
  };
  const html = `<meta property="og:title" content="Unisex Wide Straight Slacks | GU US">
    <script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)};</script>`;
  const sourceUrl = "https://www.gu-global.com/us/en/products/E359786-000/00?colorDisplayCode=06&sizeDisplayCode=004";
  const parsed = parseProductHtml(html, sourceUrl);
  const result = enrichGuProductWithInventory(parsed, {
    result: {
      l2s: [
        { color: { displayCode: "06" }, size: { displayCode: "002" }, l2Id: "1" },
        { color: { displayCode: "06" }, size: { displayCode: "003" }, l2Id: "2" },
        { color: { displayCode: "06" }, size: { displayCode: "004" }, l2Id: "3" },
        { color: { displayCode: "09" }, size: { displayCode: "004" }, l2Id: "4" },
      ],
      stocks: {
        1: { statusCode: "LOW_STOCK", quantity: 1, disableSizeChip: false },
        2: { statusCode: "IN_STOCK", quantity: 11, disableSizeChip: false },
        3: { statusCode: "STOCK_OUT", quantity: 0, disableSizeChip: true },
        4: { statusCode: "IN_STOCK", quantity: 8, disableSizeChip: false },
      },
    },
  }, sourceUrl, html);
  assert.equal(result.priceCents, 2490);
  assert.equal(result.currency, "USD");
  assert.equal(result.category, "Bottoms");
  assert.equal(result.selectedColor, "GRAY");
  assert.equal(result.imageUrl, "https://image.example/gray.jpg");
  assert.deepEqual(result.sizes, [
    {
      label: "XS",
      status: "in-stock",
      variantId: "1",
      url: "https://www.gu-global.com/us/en/products/E359786-000/00?colorDisplayCode=06&sizeDisplayCode=002",
    },
    {
      label: "S",
      status: "in-stock",
      variantId: "2",
      url: "https://www.gu-global.com/us/en/products/E359786-000/00?colorDisplayCode=06&sizeDisplayCode=003",
    },
    {
      label: "M",
      status: "out-of-stock",
      variantId: "3",
      url: "https://www.gu-global.com/us/en/products/E359786-000/00?colorDisplayCode=06&sizeDisplayCode=004",
    },
  ]);
  assert.deepEqual(result.colors?.map((color) => ({
    label: color.label,
    imageUrl: color.imageUrl,
    statuses: color.sizes.map((size) => `${size.label}:${size.status}`),
  })), [
    {
      label: "GRAY",
      imageUrl: "https://image.example/gray.jpg",
      statuses: ["XS:in-stock", "S:in-stock", "M:out-of-stock"],
    },
    {
      label: "BLACK",
      imageUrl: "https://image.example/black.jpg",
      statuses: ["XS:unknown", "S:unknown", "M:in-stock"],
    },
  ]);
  assert.equal(
    result.colors?.[1].sizes[2].url,
    "https://www.gu-global.com/us/en/products/E359786-000/00?colorDisplayCode=09&sizeDisplayCode=004",
  );
  assert.equal(
    getGuInventoryUrl(sourceUrl),
    "https://www.gu-global.com/us/api/commerce/v5/en/products/E359786-000/price-groups/00/l2s?withPrices=true&withStocks=true&includePreviousPrice=true&httpFailure=true",
  );
});

test("uses a Shopify variant link for the selected color, image, and per-color sizes", () => {
  const sourceUrl = "https://www.youngla.com/products/2093?variant=45456468148412";
  const html = `<meta property="og:title" content="2093 - Patchwork Sweats"><script>Shopify.theme = { name: "Camouflage" };</script>`;
  const parsed = parseProductHtml(html, sourceUrl);
  const result = enrichShopifyProductWithVariants(parsed, {
    title: "2093 - Patchwork Sweats",
    vendor: "YoungLA",
    type: "Pants",
    options: [
      { name: "Color", position: 1, values: ["Black Wash", "Heather Grey"] },
      { name: "Size", position: 2, values: ["Small", "Medium"] },
    ],
    variants: [
      { id: 1, option1: "Black Wash", option2: "Small", available: false, price: 6400, featured_image: { src: "https://image.example/black.jpg" } },
      { id: 2, option1: "Black Wash", option2: "Medium", available: true, price: 6400, featured_image: { src: "https://image.example/black.jpg" } },
      { id: 45456468148412, option1: "Heather Grey", option2: "Small", available: true, price: 6400, featured_image: { src: "https://image.example/grey.jpg" } },
      { id: 4, option1: "Heather Grey", option2: "Medium", available: false, price: 6400, featured_image: { src: "https://image.example/grey.jpg" } },
    ],
  }, sourceUrl);

  assert.equal(getShopifyProductJsonUrl(sourceUrl, html), "https://www.youngla.com/products/2093.js");
  assert.equal(result.selectedColor, "Heather Grey");
  assert.equal(result.imageUrl, "https://image.example/grey.jpg");
  assert.equal(result.priceCents, 6400);
  assert.equal(result.category, "Bottoms");
  assert.deepEqual(result.sizes, [
    { label: "Small", status: "in-stock", variantId: "45456468148412" },
    { label: "Medium", status: "out-of-stock", variantId: "4" },
  ]);
  assert.deepEqual(result.colors?.map((color) => ({ label: color.label, imageUrl: color.imageUrl })), [
    { label: "Black Wash", imageUrl: "https://image.example/black.jpg" },
    { label: "Heather Grey", imageUrl: "https://image.example/grey.jpg" },
  ]);
});

test("reads Foot Locker shoe category, colors, sizes, and availability from hydration data", () => {
  const inventory = (available) => ({ inventoryAvailable: available });
  const hydration = {
    loaderData: {
      product: {
        model: { attributes: { categories: ["Shoes"], styles: ["Casual Sneakers"] } },
        style: { sku: "W2288111", color: "White/White" },
        sizes: [
          { id: "white-6", sku: "W2288111", color: "White/White", size: "06.0", active: true, inventory: inventory(true), price: { salePrice: 115 } },
          { id: "white-65", sku: "W2288111", color: "White/White", size: "06.5", active: false, inventory: inventory(false), price: { salePrice: 115 } },
        ],
        styleVariants: [
          { id: "white-6", sku: "W2288111", color: "White/White", size: "06.0", active: true, inventory: inventory(true), price: { salePrice: 115 } },
          { id: "white-65", sku: "W2288111", color: "White/White", size: "06.5", active: false, inventory: inventory(false), price: { salePrice: 115 } },
          { id: "black-6", sku: "2288001M", color: "Black/Black", size: "06.0", active: true, inventory: inventory(true), price: { salePrice: 115 } },
        ],
      },
    },
  };
  const html = [
    `<meta property="og:title" content="Nike Air Force 1 '07 - Men's">`,
    `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(JSON.stringify(hydration))})</script>`,
  ].join("");

  const result = parseProductHtml(html, "https://www.footlocker.com/product/~/W2288111.html");

  assert.equal(result.category, "Shoes");
  assert.equal(result.selectedColor, "White/White");
  assert.equal(result.priceCents, 11500);
  assert.deepEqual(result.sizes.map(({ label, status }) => ({ label, status })), [
    { label: "US 6", status: "in-stock" },
    { label: "US 6.5", status: "out-of-stock" },
  ]);
  assert.deepEqual(result.colors?.map((color) => ({ label: color.label, sizes: color.sizes.length })), [
    { label: "White/White", sizes: 2 },
    { label: "Black/Black", sizes: 1 },
  ]);
});

test("reads Birkenstock colors and gender-specific US size availability", () => {
  const sourceUrl = "https://www.birkenstock.com/us/boston/boston-u_49.html";
  const variationUrl = "https://www.birkenstock.com/on/demandware.store/Sites-US-Site/en_US/Product-Variation?color=49&pid=boston-u_49";
  const html = `<meta property="og:title" content="Boston Soft Footbed"><button class="m-attribute_color" aria-checked="true" data-attr-url="${variationUrl.replace("&", "&amp;")}"></button>`;
  const parsed = parseProductHtml(html, sourceUrl);
  const image = (url) => ({ small: [{ url, absURL: url }] });
  const result = enrichBirkenstockProductWithVariation(parsed, {
    product: {
      id: "boston-u_49",
      productName: "Boston Soft Footbed",
      brand: "Birkenstock",
      colorName: "Black",
      selectedProductUrl: "/us/boston/boston-u_49.html",
      price: { sales: { value: 169.95, currency: "USD" } },
      variationAttributes: [
        { id: "color", values: [
          { id: "49", displayValue: "Black", selected: true, visible: true, variationGroupUrl: "/us/boston/boston-u_49.html", images: image("https://image.example/black.jpg?sw=160") },
          { id: "46", displayValue: "Taupe", selected: false, visible: true, variationGroupUrl: "/us/boston/boston-u_46.html", images: image("https://image.example/taupe.jpg?sw=160") },
        ] },
        { id: "size", values: [
          { id: "225", displayValue: JSON.stringify({ wsize: "35;4-4.5", msize: "" }), selectable: false },
          { id: "250", displayValue: JSON.stringify({ wsize: "39;8-8.5", msize: "39;6-6.5" }), selectable: true },
        ] },
      ],
    },
  }, sourceUrl);

  assert.equal(getBirkenstockVariationUrl(sourceUrl, html), variationUrl);
  assert.equal(result.category, "Shoes");
  assert.equal(result.selectedColor, "Black");
  assert.equal(result.priceCents, 16995);
  assert.deepEqual(result.sizes.map(({ label, status }) => ({ label, status })), [
    { label: "Women's US 4-4.5", status: "out-of-stock" },
    { label: "Women's US 8-8.5", status: "in-stock" },
    { label: "Men's US 6-6.5", status: "in-stock" },
  ]);
  assert.deepEqual(result.colors?.map((color) => ({ label: color.label, sizes: color.sizes.length })), [
    { label: "Black", sizes: 3 },
    { label: "Taupe", sizes: 0 },
  ]);
});

test("round trips an account product between the app and Supabase row shape", () => {
  const row = {
    id: "2a0328db-6090-42b5-98ee-ad52f14a8f91",
    user_id: "97019b8f-7043-483f-b564-1f0238f6103a",
    url: "https://shop.example/products/tee?variant=small",
    canonical_url: "https://shop.example/products/tee",
    title: "Everyday tee",
    brand: "Common Label",
    retailer: "Common Label",
    image_url: "https://image.example/tee.jpg",
    price_cents: 4200,
    currency: "USD",
    category: "Tops",
    selected_size: "S",
    selected_color: "Black",
    stock_status: "in-stock",
    sizes: [{ label: "S", status: "in-stock" }],
    colors: null,
    collection: "closet",
    purchased_at: "2026-08-02T22:00:00.000Z",
    checked_at: "2026-08-02T21:00:00.000Z",
    created_at: "2026-08-01T21:00:00.000Z",
    updated_at: "2026-08-02T22:00:00.000Z",
  };
  const product = productFromRow(row);
  assert.equal(product.collection, "closet");
  assert.equal(product.purchasedAt, "2026-08-02T22:00:00.000Z");
  const encoded = productToRow(product, row.user_id);
  assert.equal(encoded.user_id, row.user_id);
  assert.equal(encoded.canonical_url, row.canonical_url);
  assert.equal(encoded.collection, "closet");
  assert.deepEqual(encoded.sizes, row.sizes);
});
