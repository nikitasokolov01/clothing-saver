import type { ProductDraft, SizeOption, StockStatus } from "./types";

type JsonRecord = Record<string, unknown>;

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["Shoes", /\b(shoe|sneaker|boot|loafer|heel|sandal|trainer)\b/i],
  ["Bottoms", /\b(jean|trouser|pant|short|skirt|legging|chino)\b/i],
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

  const product = objects.find((item) => hasType(item["@type"], "Product")) ?? {};
  const offer = getOffer(product);
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  const canonicalUrl = normalizeProductUrl(canonicalMatch?.[1] || sourceUrl);
  const title = textValue(product.name) || readMeta(html, "og:title") || "Untitled product";
  const brand = textValue(product.brand) || readMeta(html, "product:brand");
  const priceRaw = textValue(offer.price ?? offer.lowPrice) || readMeta(html, "product:price:amount");
  const parsedPrice = Number(priceRaw.replace(/[^0-9.,-]/g, "").replace(",", "."));
  const sizes = extractSizes(product);

  return {
    url: sourceUrl,
    canonicalUrl,
    title,
    brand,
    retailer: brand || retailerFromUrl(canonicalUrl),
    imageUrl: firstImage(product.image) || readMeta(html, "og:image"),
    priceCents: Number.isFinite(parsedPrice) ? Math.round(parsedPrice * 100) : null,
    currency: textValue(offer.priceCurrency) || readMeta(html, "product:price:currency") || "USD",
    category: guessCategory(`${title} ${textValue(product.category)}`),
    selectedSize: "",
    selectedColor: textValue(product.color),
    status: sizes.length ? "unknown" : availabilityStatus(offer.availability ?? product.availability),
    sizes,
  };
}

export function statusForSize(sizes: SizeOption[], selectedSize: string, fallback: StockStatus): StockStatus {
  if (!selectedSize) return fallback;
  return sizes.find((size) => size.label.toLowerCase() === selectedSize.toLowerCase())?.status ?? "unknown";
}
