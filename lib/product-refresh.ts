import type { ColorOption, ProductDraft, SavedProduct } from "./types";

function sameLabel(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function selectedColor(colors: ColorOption[] | undefined, label: string) {
  if (!label) return undefined;
  return colors?.find((color) => sameLabel(color.label, label));
}

function highestPrice(...prices: Array<number | null | undefined>) {
  const valid = prices.filter((price): price is number => typeof price === "number" && price > 0);
  return valid.length ? Math.max(...valid) : null;
}

function refreshedStatus(sizes: SavedProduct["sizes"], selectedSize: string, fallback: SavedProduct["status"]) {
  if (!selectedSize) return fallback;
  return sizes.find((size) => sameLabel(size.label, selectedSize))?.status ?? "unknown";
}

export function salePercentage(priceCents: number | null, originalPriceCents: number | null | undefined) {
  if (!priceCents || !originalPriceCents || priceCents >= originalPriceCents) return 0;
  return Math.round((1 - priceCents / originalPriceCents) * 100);
}

export function mergeProductRefresh(product: SavedProduct, fresh: ProductDraft, checkedAt = new Date().toISOString()) {
  const freshColors = fresh.colors?.length ? fresh.colors : product.colors;
  const preservedColor = selectedColor(freshColors, product.selectedColor);
  const fallbackColor = selectedColor(freshColors, fresh.selectedColor) ?? freshColors?.[0];
  const color = preservedColor ?? fallbackColor;
  const nextSizes = color?.sizes?.length ? color.sizes : fresh.sizes.length ? fresh.sizes : product.sizes;
  const keepsSelectedColor = Boolean(preservedColor);
  const nextPriceCents = color?.priceCents ?? fresh.priceCents ?? product.priceCents;
  const dropped = product.priceCents !== null
    && nextPriceCents !== null
    && nextPriceCents < product.priceCents;
  const originalPriceCents = highestPrice(
    product.originalPriceCents,
    fresh.originalPriceCents,
    color?.originalPriceCents,
    dropped ? product.priceCents : null,
  );

  const updated: SavedProduct = {
    ...product,
    title: fresh.title || product.title,
    brand: fresh.brand || product.brand,
    retailer: fresh.retailer || product.retailer,
    imageUrl: color?.imageUrl || (keepsSelectedColor ? product.imageUrl : fresh.imageUrl) || product.imageUrl,
    priceCents: nextPriceCents,
    originalPriceCents,
    currency: color?.currency || fresh.currency || product.currency,
    selectedColor: color?.label || product.selectedColor || fresh.selectedColor,
    colors: freshColors,
    sizes: nextSizes,
    status: refreshedStatus(nextSizes, product.selectedSize, fresh.status),
    checkedAt,
  };

  return {
    product: updated,
    priceDropped: dropped,
    previousPriceCents: dropped ? product.priceCents : null,
  };
}
