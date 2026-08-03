import type { ColorOption, ProductCollection, SavedProduct, SizeOption, StockStatus } from "./types";

export type ProductRow = {
  id: string;
  user_id: string;
  url: string;
  canonical_url: string;
  title: string;
  brand: string;
  retailer: string;
  image_url: string;
  price_cents: number | null;
  original_price_cents: number | null;
  currency: string;
  category: string;
  selected_size: string;
  selected_color: string;
  stock_status: StockStatus;
  sizes: SizeOption[];
  colors: ColorOption[] | null;
  collection: ProductCollection;
  purchased_at: string | null;
  checked_at: string;
  created_at: string;
  updated_at: string;
};

export function productFromRow(row: ProductRow): SavedProduct {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title,
    brand: row.brand,
    retailer: row.retailer,
    imageUrl: row.image_url,
    priceCents: row.price_cents,
    originalPriceCents: row.original_price_cents,
    currency: row.currency,
    category: row.category,
    selectedSize: row.selected_size,
    selectedColor: row.selected_color,
    status: row.stock_status,
    sizes: row.sizes ?? [],
    colors: row.colors ?? undefined,
    collection: row.collection,
    purchasedAt: row.purchased_at,
    checkedAt: row.checked_at,
    createdAt: row.created_at,
  };
}

export function productToRow(product: SavedProduct, userId: string) {
  return {
    id: product.id,
    user_id: userId,
    url: product.url,
    canonical_url: product.canonicalUrl,
    title: product.title,
    brand: product.brand,
    retailer: product.retailer,
    image_url: product.imageUrl,
    price_cents: product.priceCents,
    original_price_cents: product.originalPriceCents,
    currency: product.currency,
    category: product.category,
    selected_size: product.selectedSize,
    selected_color: product.selectedColor,
    stock_status: product.status,
    sizes: product.sizes,
    colors: product.colors ?? null,
    collection: product.collection,
    purchased_at: product.purchasedAt,
    checked_at: product.checkedAt,
    created_at: product.createdAt,
    updated_at: new Date().toISOString(),
  };
}
