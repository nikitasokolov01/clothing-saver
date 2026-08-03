import assert from "node:assert/strict";
import test from "node:test";
import { convertCurrencyCents, normalizeCurrency } from "../lib/currency.ts";

test("normalizes retailer currency codes", () => {
  assert.equal(normalizeCurrency(" cny "), "CNY");
  assert.equal(normalizeCurrency("not-a-code"), "USD");
});

test("converts the app's hundredths-of-a-currency-unit price representation", () => {
  assert.equal(convertCurrencyCents(10_000, 0.14), 1_400);
});
