export type StockStatus = "in-stock" | "out-of-stock" | "unknown";
export type ProductCollection = "saved" | "closet";

export type SizeOption = {
  label: string;
  status: StockStatus;
  variantId?: string;
  url?: string;
};

export type ColorOption = {
  label: string;
  imageUrl: string;
  sizes: SizeOption[];
  priceCents?: number | null;
  originalPriceCents?: number | null;
  currency?: string;
  variantId?: string;
  url?: string;
};

export type ProductDraft = {
  url: string;
  canonicalUrl: string;
  title: string;
  brand: string;
  retailer: string;
  imageUrl: string;
  priceCents: number | null;
  originalPriceCents?: number | null;
  currency: string;
  category: string;
  selectedSize: string;
  selectedColor: string;
  status: StockStatus;
  sizes: SizeOption[];
  colors?: ColorOption[];
};

export type SavedProduct = ProductDraft & {
  id: string;
  originalPriceCents: number | null;
  collection: ProductCollection;
  purchasedAt: string | null;
  checkedAt: string;
  createdAt: string;
};
