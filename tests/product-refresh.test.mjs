import assert from "node:assert/strict";
import test from "node:test";
import { mergeProductRefresh, salePercentage } from "../lib/product-refresh.ts";

const saved = {
  id: "product-1",
  url: "https://mulebuy.com/product?id=7645749495&platform=WEIDIAN",
  canonicalUrl: "https://mulebuy.com/product?id=7645749495&platform=WEIDIAN",
  title: "Shoes",
  brand: "",
  retailer: "Weidian",
  imageUrl: "https://image.example/selected.jpg",
  priceCents: 20000,
  originalPriceCents: null,
  currency: "CNY",
  category: "Shoes",
  selectedSize: "42",
  selectedColor: "SK01-16756",
  status: "in-stock",
  sizes: [{ label: "42", status: "in-stock" }],
  colors: [],
  collection: "saved",
  purchasedAt: null,
  checkedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
};

test("refresh preserves a saved color, its image, and its selected size", () => {
  const result = mergeProductRefresh(saved, {
    ...saved,
    id: undefined,
    collection: undefined,
    purchasedAt: undefined,
    checkedAt: undefined,
    createdAt: undefined,
    selectedColor: "SK01-16754",
    imageUrl: "https://image.example/first.jpg",
    colors: [
      { label: "SK01-16754", imageUrl: "https://image.example/first.jpg", sizes: [{ label: "42", status: "out-of-stock" }] },
      { label: "SK01-16756", imageUrl: "https://image.example/selected-new.jpg", sizes: [{ label: "42", status: "in-stock" }] },
    ],
  }, "2026-08-03T00:00:00.000Z");

  assert.equal(result.product.selectedColor, "SK01-16756");
  assert.equal(result.product.imageUrl, "https://image.example/selected-new.jpg");
  assert.equal(result.product.selectedSize, "42");
  assert.equal(result.product.status, "in-stock");
});

test("refresh records the prior price when a product drops", () => {
  const result = mergeProductRefresh(saved, { ...saved, priceCents: 15000 }, "2026-08-03T00:00:00.000Z");
  assert.equal(result.priceDropped, true);
  assert.equal(result.previousPriceCents, 20000);
  assert.equal(result.product.originalPriceCents, 20000);
  assert.equal(salePercentage(result.product.priceCents, result.product.originalPriceCents), 25);
});
