import type { ProductDraft, SizeOption, StockStatus } from "./types";

type JsonRecord = Record<string, unknown>;

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["Shoes", /\b(shoe|sneaker|boot|loafer|heel|sandal|trainer)\b/i],
  ["Bottoms", /\b(jean|trouser|pant|short|skirt|legging|chino|slack|sweatpant|sweat)s?\b/i],
  ["Accessories", /\b(bag|belt|hat|cap|scarf|jewelry|watch|wallet|sunglass)\b/i],
  ["Underwear", /\b(underwear|brief|boxer|bra|bralette|lingerie|sock)\b/i],
  ["Outerwear", /\b(jacket|coat|parka|blazer|vest)\b/i],
  ["Tops", /\b(shirt|tee|t-shirt|sweater|hoodie|blouse|top|cardigan|polo)\b/i],
];

export function normalizeProductUrl(raw: string) {
  const parsed = new URL(raw.trim());
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Use a web link beginning with http:// or https://.");
  }
  parsed.hash = "";
  const removable = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
  ];
  removable.forEach((key) => parsed.searchParams.delete(key));
  [...parsed.searchParams.keys()].filter((key) => key.startsWith("_su_")).forEach((key) => parsed.searchParams.delete(key));
  parsed.searchParams.sort();
  return parsed.toString();
}

export function isSafePublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "name" in value) {
    return textValue((value as JsonRecord).name);
  }
  return "";
}

function firstImage(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object") {
    return textValue((candidate as JsonRecord).url ?? (candidate as JsonRecord).contentUrl);
  }
  return "";
}

function flattenJsonLd(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const object = value as JsonRecord;
  const graph = Array.isArray(object["@graph"]) ? flattenJsonLd(object["@graph"]) : [];
  return [object, ...graph];
}

function hasType(value: unknown, wanted: string) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) =>
    typeof item === "string" && item.toLowerCase().split("/").pop() === wanted.toLowerCase()
  );
}

function availabilityStatus(value: unknown): StockStatus {
  const normalized = textValue(value).toLowerCase();
  if (/outofstock|soldout|discontinued/.test(normalized)) return "out-of-stock";
  if (/instock|limitedavailability|onlineonly|instoreonly|preorder|presale/.test(normalized)) {
    return "in-stock";
  }
  return "unknown";
}

function readMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function asRecords(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => !!item && typeof item === "object");
  return value && typeof value === "object" ? [value as JsonRecord] : [];
}

function getOffer(product: JsonRecord) {
  const offers = asRecords(product.offers);
  return offers.find((offer) => offer.price || offer.lowPrice) ?? offers[0] ?? {};
}

function getSize(record: JsonRecord) {
  const direct = textValue(record.size);
  if (direct) return direct;
  const properties = asRecords(record.additionalProperty);
  const sizeProperty = properties.find((property) => /size/i.test(textValue(property.name)));
  return textValue(sizeProperty?.value);
}

function extractSizes(product: JsonRecord): SizeOption[] {
  const found = new Map<string, StockStatus>();
  const variants = [
    ...asRecords(product.hasVariant),
    ...asRecords(product.isVariantOf),
    ...asRecords(product.model),
  ];
  for (const variant of variants) {
    const label = getSize(variant);
    if (!label) continue;
    const offer = getOffer(variant);
    found.set(label, availabilityStatus(offer.availability ?? variant.availability));
  }

  const productSize = getSize(product);
  if (productSize) {
    const offer = getOffer(product);
    found.set(productSize, availabilityStatus(offer.availability ?? product.availability));
  }

  return [...found.entries()].map(([label, status]) => ({ label, status }));
}

type NormalizedVariant = {
  id: string;
  color: string;
  size: string;
  status: StockStatus;
  imageUrl: string;
  url: string;
  priceCents: number | null;
  currency: string;
};

function propertyValue(record: JsonRecord, wanted: RegExp) {
  const property = asRecords(record.additionalProperty).find((item) => wanted.test(textValue(item.name)));
  return textValue(property?.value);
}

function getColor(record: JsonRecord) {
  return textValue(record.color) || propertyValue(record, /^colou?r$/i);
}

function variantIdentifier(record: JsonRecord) {
  return textValue(record.productID ?? record.sku ?? record.gtin ?? record.mpn ?? record["@id"]);
}

function absoluteUrl(value: unknown, sourceUrl: string) {
  const raw = textValue(value);
  if (!raw) return "";
  try {
    return new URL(raw, sourceUrl).toString();
  } catch {
    return "";
  }
}

function mergeStatus(current: StockStatus | undefined, next: StockStatus): StockStatus {
  if (current === "in-stock" || next === "in-stock") return "in-stock";
  if (current === "unknown" || next === "unknown") return "unknown";
  return "out-of-stock";
}

function buildVariantMatrix(rows: NormalizedVariant[], preferredColor = "", selectedRow?: NormalizedVariant) {
  if (!rows.length) return null;
  const colorLabels = [...new Set(rows.map((row) => row.color).filter(Boolean))];
  const requestedColor = selectedRow?.color || preferredColor;
  const selectedColor = colorLabels.find((label) => label.toLowerCase() === requestedColor.toLowerCase()) ?? colorLabels[0] ?? "";

  const sizeOptions = (variants: NormalizedVariant[]) => {
    const found = new Map<string, SizeOption>();
    for (const row of variants) {
      if (!row.size) continue;
      const current = found.get(row.size);
      const variantId = current?.variantId || row.id;
      const url = current?.url || row.url;
      found.set(row.size, {
        label: row.size,
        status: mergeStatus(current?.status, row.status),
        ...(variantId ? { variantId } : {}),
        ...(url ? { url } : {}),
      });
    }
    return [...found.values()];
  };

  const colors = colorLabels.map((label) => {
    const matching = rows.filter((row) => row.color === label);
    const variantId = matching.map((row) => row.id).find(Boolean);
    const url = matching.map((row) => row.url).find(Boolean);
    return {
      label,
      imageUrl: matching.map((row) => row.imageUrl).find(Boolean) ?? "",
      sizes: sizeOptions(matching),
      ...(variantId ? { variantId } : {}),
      ...(url ? { url } : {}),
    };
  });
  const selectedColorOption = colors.find((color) => color.label === selectedColor);
  const selected = selectedRow ?? rows.find((row) => !selectedColor || row.color === selectedColor) ?? rows[0];

  return {
    colors,
    selectedColor,
    sizes: selectedColorOption?.sizes ?? sizeOptions(rows),
    imageUrl: selected.imageUrl || selectedColorOption?.imageUrl || "",
    priceCents: selected.priceCents,
    currency: selected.currency,
  };
}

function extractStructuredVariantMatrix(product: JsonRecord, sourceUrl: string) {
  const variants = asRecords(product.hasVariant);
  if (!variants.length) return null;
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    // A malformed source URL is already handled by the importer.
  }
  const queryValues = new Set(parsedUrl ? [...parsedUrl.searchParams.values()].map((value) => value.toLowerCase()) : []);

  const rows = variants.map((variant): NormalizedVariant => {
    const offer = getOffer(variant);
    const price = Number(textValue(offer.price ?? offer.lowPrice).replace(/[^0-9.,-]/g, "").replace(",", "."));
    return {
      id: variantIdentifier(variant),
      color: getColor(variant),
      size: getSize(variant),
      status: availabilityStatus(offer.availability ?? variant.availability),
      imageUrl: firstImage(variant.image),
      url: absoluteUrl(variant.url, sourceUrl),
      priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
      currency: textValue(offer.priceCurrency),
    };
  });
  const selectedIndex = variants.findIndex((variant, index) => {
    const identifiers = [variantIdentifier(variant), textValue(variant.sku), textValue(variant.productID)]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    if (identifiers.some((value) => queryValues.has(value))) return true;
    const rowUrl = rows[index].url;
    return !!parsedUrl && !!rowUrl && new URL(rowUrl).search === parsedUrl.search;
  });
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
  return buildVariantMatrix(rows, getColor(product), selectedRow);
}

function readTagAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function extractSizesFromControls(html: string): SizeOption[] {
  const found = new Map<string, StockStatus>();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = readTagAttributes(match[0]);
    const name = attributes.get("name") ?? "";
    const type = attributes.get("type")?.toLowerCase() ?? "";
    const label = attributes.get("value")?.trim() ?? "";
    if (type !== "radio" || !/size/i.test(name) || !label) continue;
    const unavailable = attributes.has("disabled") || attributes.get("aria-disabled") === "true" || /(?:sold|out.of.stock|unavailable|disabled)/i.test(attributes.get("class") ?? "");
    found.set(label, unavailable ? "out-of-stock" : "in-stock");
  }
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const selectAttributes = readTagAttributes(`<select ${match[1]}>`);
    if (!/size/i.test(selectAttributes.get("name") ?? selectAttributes.get("id") ?? "")) continue;
    for (const option of match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const attributes = readTagAttributes(`<option ${option[1]}>`);
      const label = decodeHtml(option[2].replace(/<[^>]+>/g, "")).trim();
      if (!label || /choose|select/i.test(label)) continue;
      found.set(label, attributes.has("disabled") ? "out-of-stock" : "in-stock");
    }
  }
  return [...found.entries()].map(([label, status]) => ({ label, status }));
}

function selectedColorFromControls(html: string) {
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = readTagAttributes(match[0]);
    if (!attributes.has("checked") || !/colou?r/i.test(attributes.get("name") ?? "")) continue;
    const value = attributes.get("value")?.trim();
    if (value) return value;
  }
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const attributes = readTagAttributes(`<select ${match[1]}>`);
    if (!/colou?r/i.test(attributes.get("name") ?? attributes.get("id") ?? "")) continue;
    const selected = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
      .find((option) => readTagAttributes(`<option ${option[1]}>`).has("selected"));
    if (selected) return decodeHtml(selected[2].replace(/<[^>]+>/g, "")).trim();
  }
  return "";
}

function humanizeOption(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the retailer's original value when it is not URI encoded.
  }
  return decoded.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function extractWooCommerceVariantMatrix(html: string, sourceUrl: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return null;
  }
  for (const match of html.matchAll(/data-product_variations\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    let variations: JsonRecord[] = [];
    try {
      variations = asRecords(JSON.parse(decodeHtml(match[2])));
    } catch {
      continue;
    }
    if (!variations.length) continue;
    const attributeKeys = [...new Set(variations.flatMap((variation) => Object.keys(asRecord(variation.attributes))))];
    const colorKey = attributeKeys.find((key) => /colou?r/i.test(key)) ?? "";
    const sizeKey = attributeKeys.find((key) => /size/i.test(key)) ?? "";
    const rows = variations.map((variation): NormalizedVariant => {
      const attributes = asRecord(variation.attributes);
      const rowUrl = new URL(sourceUrl);
      rowUrl.search = "";
      for (const [key, value] of Object.entries(attributes)) {
        const option = textValue(value);
        if (option) rowUrl.searchParams.set(key, option);
      }
      const id = textValue(variation.variation_id ?? variation.id);
      if (id) rowUrl.searchParams.set("variation_id", id);
      const inStock = variation.is_in_stock;
      const status: StockStatus = inStock === true ? "in-stock" : inStock === false ? "out-of-stock" : "unknown";
      const amount = Number(variation.display_price ?? variation.price);
      return {
        id,
        color: colorKey ? humanizeOption(textValue(attributes[colorKey])) : "",
        size: sizeKey ? humanizeOption(textValue(attributes[sizeKey])) : "",
        status,
        imageUrl: textValue(asRecord(variation.image).src ?? asRecord(variation.image).url),
        url: rowUrl.toString(),
        priceCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
        currency: "",
      };
    });
    const requestedId = parsedUrl.searchParams.get("variation_id") ?? "";
    const selectedRow = rows.find((row) => row.id === requestedId) ?? rows.find((row, index) => {
      const attributes = asRecord(variations[index].attributes);
      return Object.entries(attributes).every(([key, value]) => {
        const requested = parsedUrl.searchParams.get(key);
        return !requested || requested === textValue(value);
      });
    });
    return buildVariantMatrix(rows, selectedRow?.color ?? "", selectedRow);
  }
  return null;
}

function embeddedStorefrontPriceCents(html: string) {
  const shopifyPrice = html.match(/"price_min"\s*:\s*(\d+)/i)?.[1];
  const cents = Number(shopifyPrice);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function extractGuPreloadedState(html: string) {
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const content = match[1].trim();
    if (!content.startsWith("window.__PRELOADED_STATE__")) continue;
    const json = content.replace(/^window\.__PRELOADED_STATE__\s*=\s*/, "").replace(/;\s*$/, "");
    try {
      return asRecord(JSON.parse(json));
    } catch {
      return null;
    }
  }
  return null;
}

function productFromGuState(state: JsonRecord) {
  const productKey = textValue(asRecord(state.pdp).product);
  const entities = asRecord(asRecord(state.entity).pdpEntity);
  return asRecord(asRecord(entities[productKey]).product);
}

function extractGuSizeStatuses(html: string) {
  const statuses = new Map<string, StockStatus>();
  const wrapperPattern = /<div\b[^>]*class=["'][^"']*\bsize-chip-wrapper\b[^"']*["'][^>]*>\s*<button\b([^>]*)>[\s\S]*?<\/button>\s*<div\b[^>]*class=["']([^"']*)["'][^>]*>\s*<\/div>\s*<\/div>/gi;
  for (const match of html.matchAll(wrapperPattern)) {
    const attributes = readTagAttributes(`<button ${match[1]}>`);
    const sizeCode = attributes.get("value") ?? "";
    if (!sizeCode) continue;
    statuses.set(sizeCode, /\bstrike\b/i.test(match[2]) ? "out-of-stock" : "in-stock");
  }
  return statuses;
}

function extractGuProduct(html: string, sourceUrl: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)gu-global\.com$/i.test(parsedUrl.hostname)) return null;

  const state = extractGuPreloadedState(html);
  if (!state) return null;

  const product = productFromGuState(state);
  if (!Object.keys(product).length) return null;

  const prices = asRecord(product.prices);
  const promo = asRecord(prices.promo);
  const base = asRecord(prices.base);
  const price = Number(promo.value ?? base.value);
  const currency = textValue(asRecord(promo.currency).code ?? asRecord(base.currency).code) || "USD";
  const selectedColorCode = parsedUrl.searchParams.get("colorDisplayCode") ?? "";
  const colors = asRecords(product.colors);
  const selectedColor = colors.find((color) => textValue(color.displayCode) === selectedColorCode) ?? colors[0] ?? {};
  const mainImages = asRecord(asRecord(product.images).main);
  const selectedImage = asRecord(mainImages[selectedColorCode] ?? Object.values(mainImages)[0]);
  const breadcrumbs = Object.values(asRecord(product.breadcrumbs))
    .map(asRecord)
    .map((crumb) => textValue(crumb.locale ?? crumb.name))
    .filter(Boolean)
    .join(" ");
  const sizeStatuses = extractGuSizeStatuses(html);
  const sizes = asRecords(product.sizes)
    .map((size) => ({
      label: textValue(size.name),
      status: sizeStatuses.get(textValue(size.displayCode)) ?? "unknown" as const,
    }))
    .filter((size) => size.label);

  return {
    title: textValue(product.name),
    brand: "GU",
    imageUrl: textValue(selectedImage.image),
    priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    currency,
    categoryText: `${textValue(product.name)} ${breadcrumbs}`,
    selectedColor: textValue(selectedColor.name),
    sizes,
  };
}

export function getGuInventoryUrl(sourceUrl: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)gu-global\.com$/i.test(parsedUrl.hostname)) return null;

  const match = parsedUrl.pathname.match(/^\/([a-z]{2})\/([a-z]{2})\/products\/(E\d{6}-\d{3})\/(\d{2})(?:\/|$)/i);
  if (!match) return null;

  const [, country, language, productId, priceGroup] = match;
  const inventoryUrl = new URL(
    `/${country.toLowerCase()}/api/commerce/v5/${language.toLowerCase()}/products/${productId.toUpperCase()}/price-groups/${priceGroup}/l2s`,
    parsedUrl.origin,
  );
  inventoryUrl.searchParams.set("withPrices", "true");
  inventoryUrl.searchParams.set("withStocks", "true");
  inventoryUrl.searchParams.set("includePreviousPrice", "true");
  inventoryUrl.searchParams.set("httpFailure", "true");
  return inventoryUrl.toString();
}

export function enrichGuProductWithInventory(
  product: ProductDraft,
  inventoryPayload: unknown,
  sourceUrl: string,
  html: string,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return product;
  }
  if (!/(^|\.)gu-global\.com$/i.test(parsedUrl.hostname)) return product;

  const state = extractGuPreloadedState(html);
  if (!state) return product;
  const guProduct = productFromGuState(state);
  const guSizes = asRecords(guProduct.sizes);
  const labelsByCode = new Map(guSizes.map((size) => [textValue(size.displayCode), textValue(size.name)]));
  const guColors = asRecords(guProduct.colors);
  const selectedColorCode = parsedUrl.searchParams.get("colorDisplayCode") || textValue(guColors[0]?.displayCode);
  const result = asRecord(asRecord(inventoryPayload).result);
  const stocks = asRecord(result.stocks);
  const prices = asRecord(result.prices);
  const mainImages = asRecord(asRecord(guProduct.images).main);
  const sizesByColor = new Map<string, Map<string, SizeOption>>();
  let inventoryPriceCents: number | null = null;

  for (const l2 of asRecords(result.l2s)) {
    const colorCode = textValue(asRecord(l2.color).displayCode);
    const sizeCode = textValue(asRecord(l2.size).displayCode);
    const label = labelsByCode.get(sizeCode);
    const l2Id = textValue(l2.l2Id);
    if (!colorCode || !label || !l2Id) continue;

    const stock = asRecord(stocks[l2Id]);
    const stockCode = textValue(stock.statusCode).toUpperCase();
    const quantity = Number(stock.quantity);
    const isOut = stock.disableSizeChip === true || stockCode === "STOCK_OUT" || stockCode === "OUT_OF_STOCK" || quantity === 0;
    const isIn = stock.disableSizeChip === false || stockCode === "IN_STOCK" || stockCode === "LOW_STOCK" || quantity > 0;
    const status: StockStatus = isOut ? "out-of-stock" : isIn ? "in-stock" : "unknown";
    const variantUrl = new URL(sourceUrl);
    variantUrl.searchParams.set("colorDisplayCode", colorCode);
    variantUrl.searchParams.set("sizeDisplayCode", sizeCode);
    const colorSizes = sizesByColor.get(colorCode) ?? new Map<string, SizeOption>();
    const current = colorSizes.get(sizeCode);
    colorSizes.set(sizeCode, {
      label,
      status: mergeStatus(current?.status, status),
      variantId: current?.variantId || l2Id,
      url: current?.url || variantUrl.toString(),
    });
    sizesByColor.set(colorCode, colorSizes);

    if (inventoryPriceCents === null && colorCode === selectedColorCode) {
      const price = asRecord(prices[l2Id]);
      const promo = Number(asRecord(price.promo).value);
      const base = Number(asRecord(price.base).value);
      const amount = Number.isFinite(promo) && promo > 0 ? promo : base;
      if (Number.isFinite(amount) && amount > 0) inventoryPriceCents = Math.round(amount * 100);
    }
  }

  const colors = guColors.map((color) => {
    const colorCode = textValue(color.displayCode);
    const knownSizes = sizesByColor.get(colorCode) ?? new Map<string, SizeOption>();
    const sizes = guSizes.map((size) => {
      const sizeCode = textValue(size.displayCode);
      return knownSizes.get(sizeCode) ?? { label: textValue(size.name), status: "unknown" as const };
    }).filter((size) => size.label);
    const firstVariant = sizes.find((size) => size.url);
    const colorUrl = new URL(sourceUrl);
    colorUrl.searchParams.set("colorDisplayCode", colorCode);
    if (firstVariant?.url) {
      colorUrl.searchParams.set("sizeDisplayCode", new URL(firstVariant.url).searchParams.get("sizeDisplayCode") ?? "");
    }
    return {
      label: textValue(color.name),
      imageUrl: textValue(asRecord(mainImages[colorCode]).image),
      sizes,
      ...(firstVariant?.variantId ? { variantId: firstVariant.variantId } : {}),
      url: colorUrl.toString(),
    };
  }).filter((color) => color.label);
  const selectedColorName = textValue(guColors.find((color) => textValue(color.displayCode) === selectedColorCode)?.name);
  const selectedColor = colors.find((color) => color.label === selectedColorName) ?? colors[0];

  if (!colors.length && !sizesByColor.size) return product;
  return {
    ...product,
    priceCents: product.priceCents ?? inventoryPriceCents,
    imageUrl: selectedColor?.imageUrl || product.imageUrl,
    selectedColor: selectedColor?.label || product.selectedColor,
    sizes: selectedColor?.sizes ?? product.sizes,
    colors,
  };
}

export function getShopifyProductJsonUrl(sourceUrl: string, html: string) {
  if (!/(?:cdn\.shopify\.com|Shopify\.(?:theme|shop)|shopify-section)/i.test(html)) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return null;
  }
  const match = parsedUrl.pathname.match(/^(.*\/products\/[^/]+?)(?:\.js)?\/?$/i);
  if (!match) return null;
  return new URL(`${match[1]}.js`, parsedUrl.origin).toString();
}

function shopifyVariantImage(variant: JsonRecord) {
  const featuredImage = asRecord(variant.featured_image);
  const previewImage = asRecord(asRecord(variant.featured_media).preview_image);
  return textValue(featuredImage.src ?? previewImage.src);
}

function shopifyVariantStatus(variant: JsonRecord): StockStatus {
  if (variant.available === true) return "in-stock";
  if (variant.available === false) return "out-of-stock";
  return "unknown";
}

export function enrichShopifyProductWithVariants(
  product: ProductDraft,
  shopifyPayload: unknown,
  sourceUrl: string,
) {
  const payload = asRecord(shopifyPayload);
  const variants = asRecords(payload.variants);
  if (!variants.length) return product;

  const optionDefinitions = (Array.isArray(payload.options) ? payload.options : [])
    .map((option, index) => typeof option === "string" ? { name: option, position: index + 1 } : asRecord(option))
    .filter((option) => textValue(option.name));
  const colorPosition = Number(optionDefinitions.find((option) => /^colou?r$/i.test(textValue(option.name)))?.position);
  const sizePosition = Number(optionDefinitions.find((option) => /^size$/i.test(textValue(option.name)))?.position);
  const selectedVariantId = (() => {
    try {
      return new URL(sourceUrl).searchParams.get("variant") ?? "";
    } catch {
      return "";
    }
  })();
  const selectedVariant = variants.find((variant) => textValue(variant.id) === selectedVariantId) ?? variants[0];
  const selectedColor = colorPosition ? textValue(selectedVariant[`option${colorPosition}`]) : "";

  const colors = colorPosition
    ? [...new Set(variants.map((variant) => textValue(variant[`option${colorPosition}`])).filter(Boolean))].map((label) => {
        const matchingVariants = variants.filter((variant) => textValue(variant[`option${colorPosition}`]) === label);
        const sizesByLabel = new Map<string, { status: StockStatus; variantId: string }>();
        if (sizePosition) {
          for (const variant of matchingVariants) {
            const sizeLabel = textValue(variant[`option${sizePosition}`]);
            if (!sizeLabel) continue;
            const nextStatus = shopifyVariantStatus(variant);
            const current = sizesByLabel.get(sizeLabel);
            const status = current?.status === "in-stock" || nextStatus === "in-stock"
              ? "in-stock"
              : current?.status === "unknown" || nextStatus === "unknown"
                ? "unknown"
                : "out-of-stock";
            sizesByLabel.set(sizeLabel, { status, variantId: textValue(variant.id) });
          }
        }
        return {
          label,
          imageUrl: matchingVariants.map(shopifyVariantImage).find(Boolean) ?? "",
          sizes: [...sizesByLabel.entries()].map(([sizeLabel, details]) => ({ label: sizeLabel, ...details })),
          variantId: textValue(matchingVariants[0]?.id),
        };
      })
    : [];
  const selectedColorOption = colors.find((color) => color.label === selectedColor);
  const sizes = selectedColorOption?.sizes ?? (sizePosition
    ? [...new Map(variants.map((variant) => [
        textValue(variant[`option${sizePosition}`]),
        shopifyVariantStatus(variant),
      ])).entries()].filter(([label]) => label).map(([label, status]) => ({ label, status }))
    : product.sizes);
  const variantPrice = Number(selectedVariant.price);

  return {
    ...product,
    title: textValue(payload.title) || product.title,
    brand: textValue(payload.vendor) || product.brand,
    retailer: textValue(payload.vendor) || product.retailer,
    imageUrl: shopifyVariantImage(selectedVariant) || selectedColorOption?.imageUrl || product.imageUrl,
    priceCents: Number.isFinite(variantPrice) && variantPrice > 0 ? Math.round(variantPrice) : product.priceCents,
    category: guessCategory(`${textValue(payload.title)} ${textValue(payload.type)} ${product.category}`),
    selectedColor: selectedColor || product.selectedColor,
    sizes,
    colors,
  };
}

function retailerFromUrl(raw: string) {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    const root = host.split(".")[0] || host;
    return root
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Unknown retailer";
  }
}

export function guessCategory(text: string) {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "Other";
}

export function parseProductHtml(html: string, sourceUrl: string): ProductDraft {
  const objects: JsonRecord[] = [];
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      objects.push(...flattenJsonLd(JSON.parse(match[1].trim())));
    } catch {
      // Retailers occasionally publish a malformed secondary JSON-LD block.
    }
  }

  const guProduct = extractGuProduct(html, sourceUrl);
  const product = objects.find((item) => hasType(item["@type"], "Product") && asRecords(item.hasVariant).length)
    ?? objects.find((item) => hasType(item["@type"], "ProductGroup"))
    ?? objects.find((item) => hasType(item["@type"], "Product"))
    ?? {};
  const variantMatrix = extractWooCommerceVariantMatrix(html, sourceUrl) ?? extractStructuredVariantMatrix(product, sourceUrl);
  const offer = getOffer(product);
  const variantOffer = asRecords(product.hasVariant)
    .map(getOffer)
    .find((candidate) => Number(textValue(candidate.price ?? candidate.lowPrice)) > 0) ?? {};
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  const canonicalUrl = normalizeProductUrl(canonicalMatch?.[1] || sourceUrl);
  const title = textValue(product.name) || readMeta(html, "og:title") || guProduct?.title || "Untitled product";
  const brand = textValue(product.brand) || readMeta(html, "product:brand") || guProduct?.brand || "";
  const structuredPrice = Number(textValue(offer.price ?? offer.lowPrice ?? variantOffer.price ?? variantOffer.lowPrice).replace(/[^0-9.,-]/g, "").replace(",", "."));
  const variantPrice = Number(textValue(variantOffer.price ?? variantOffer.lowPrice).replace(/[^0-9.,-]/g, "").replace(",", "."));
  const metaPrice = Number(readMeta(html, "product:price:amount").replace(/[^0-9.,-]/g, "").replace(",", "."));
  const parsedPrice = Number.isFinite(structuredPrice) && structuredPrice > 0
    ? structuredPrice
    : Number.isFinite(variantPrice) && variantPrice > 0
      ? variantPrice
      : metaPrice;
  const fallbackPriceCents = embeddedStorefrontPriceCents(html);
  const structuredSizes = extractSizes(product);
  const controlSizes = extractSizesFromControls(html);
  const sizes = variantMatrix?.sizes.length
    ? variantMatrix.sizes
    : structuredSizes.length
      ? structuredSizes
      : controlSizes.length
        ? controlSizes
        : guProduct?.sizes ?? [];
  const parsedPriceCents = Number.isFinite(parsedPrice) && parsedPrice > 0 ? Math.round(parsedPrice * 100) : fallbackPriceCents;

  return {
    url: sourceUrl,
    canonicalUrl,
    title,
    brand,
    retailer: brand || retailerFromUrl(canonicalUrl),
    imageUrl: guProduct?.imageUrl || variantMatrix?.imageUrl || firstImage(product.image) || readMeta(html, "og:image"),
    priceCents: variantMatrix?.priceCents ?? parsedPriceCents ?? guProduct?.priceCents ?? null,
    currency: variantMatrix?.currency || textValue(offer.priceCurrency ?? variantOffer.priceCurrency) || readMeta(html, "product:price:currency") || guProduct?.currency || "USD",
    category: guessCategory(`${title} ${textValue(product.category)} ${guProduct?.categoryText ?? ""}`),
    selectedSize: "",
    selectedColor: variantMatrix?.selectedColor || selectedColorFromControls(html) || textValue(product.color) || guProduct?.selectedColor || "",
    status: sizes.length ? "unknown" : availabilityStatus(offer.availability ?? product.availability),
    sizes,
    colors: variantMatrix?.colors.length ? variantMatrix.colors : undefined,
  };
}

export function statusForSize(sizes: SizeOption[], selectedSize: string, fallback: StockStatus): StockStatus {
  if (!selectedSize) return fallback;
  return sizes.find((size) => size.label.toLowerCase() === selectedSize.toLowerCase())?.status ?? "unknown";
}
