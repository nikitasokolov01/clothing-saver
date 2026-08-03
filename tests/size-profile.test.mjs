import assert from "node:assert/strict";
import test from "node:test";
import { preferredSizeForProduct } from "../lib/size-profile.ts";

const product = (sizes, category = "Tops") => ({ category, sizes });

test("selects an in-stock preferred size before an out-of-stock preferred size", () => {
  const selected = preferredSizeForProduct(product([
    { label: "S", status: "out-of-stock" },
    { label: "M", status: "in-stock", variantId: "medium" },
  ]), { Tops: ["S", "M"] }, "mens");

  assert.equal(selected?.label, "M");
  assert.equal(selected?.variantId, "medium");
});

test("matches shoe sizes across US and gender-qualified labels", () => {
  const selected = preferredSizeForProduct(product([
    { label: "US W 8", status: "in-stock" },
    { label: "US M 8", status: "in-stock" },
  ], "Shoes"), { Shoes: ["US 8"] }, "womens");

  assert.equal(selected?.label, "US W 8");
});

test("does not auto-select an explicitly mismatched sizing system", () => {
  const selected = preferredSizeForProduct(product([
    { label: "Women's 8", status: "in-stock" },
  ], "Shoes"), { Shoes: ["US 8"] }, "mens");

  assert.equal(selected, undefined);
});

test("matches a preferred half size inside the correct gendered retail range", () => {
  const selected = preferredSizeForProduct(product([
    { label: "Women's US 6-6.5", status: "in-stock" },
    { label: "Men's US 6-6.5", status: "in-stock" },
  ], "Shoes"), { Shoes: ["US 6.5"] }, "mens");

  assert.equal(selected?.label, "Men's US 6-6.5");
});
