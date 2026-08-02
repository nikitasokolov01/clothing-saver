export type StockStatus = "in-stock" | "out-of-stock" | "unknown";

export type SizeOption = {
  label: string;
  status: StockStatus;
};

export type ProductDraft = {
  url: string;
  canonicalUrl: string;
  title: string;
  brand: string;
  retailer: string;
  imageUrl: string;
  priceCents: number | null;
  currency: string;
  category: string;
  selectedSize: string;
  selectedColor: string;
  status: StockStatus;
  sizes: SizeOption[];
};

export type SavedProduct = ProductDraft & {
  id: string;
  checkedAt: string;
  createdAt: string;
};
