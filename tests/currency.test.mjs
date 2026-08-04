import assert from "node:assert/strict";
import test from "node:test";
import { convertCurrencyCents, normalizeCurrency, priceForDisplay } from "../lib/currency.ts";

test("normalizes retailer currency codes", () => {
  assert.equal(normalizeCurrency(" cny "), "CNY");
  assert.equal(normalizeCurrency("not-a-code"), "USD");
});

test("converts the app's hundredths-of-a-currency-unit price representation", () => {
  assert.equal(convertCurrencyCents(10_000, 0.14), 1_400);
});

test("displays another user's price in the viewer's preferred currency", () => {
  assert.deepEqual(priceForDisplay(10_000, "CNY", "USD", { CNY: 0.14 }), {
    primary: "$14.00",
    secondary: "CN¥100.00 CNY original",
  });
});

test("keeps the retailer currency when no conversion rate is available", () => {
  assert.deepEqual(priceForDisplay(10_000, "CNY", "USD", {}), {
    primary: "CN¥100.00",
    secondary: "",
  });
});
