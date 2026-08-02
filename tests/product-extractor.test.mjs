import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafePublicUrl,
  normalizeProductUrl,
  parseProductHtml,
  statusForSize,
} from "../lib/product-extractor.ts";

test("normalizes tracking parameters while preserving product options", () => {
  assert.equal(
    normalizeProductUrl("https://shop.example/products/tee?utm_source=instagram&color=blue#details"),
    "https://shop.example/products/tee?color=blue",
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
