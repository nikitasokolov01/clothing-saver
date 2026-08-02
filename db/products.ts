import { ensureProductsTable, getD1 } from ".";
import type { ProductDraft, SavedProduct, SizeOption, StockStatus } from "../lib/types";

type ProductRow = {
  id: string;
  canonical_url: string;
  url: string;
  title: string;
  brand: string;
  retailer: string;
  image_url: string;
  price_cents: number | null;
  currency: string;
  category: string;
  selected_size: string;
  selected_color: string;
  status: StockStatus;
  sizes_json: string;
  checked_at: number;
  created_at: number;
};

function toProduct(row: ProductRow): SavedProduct {
  let sizes: SizeOption[] = [];
  try {
    sizes = JSON.parse(row.sizes_json);
  } catch {
    sizes = [];
  }
  return {
    id: row.id,
    canonicalUrl: row.canonical_url,
    url: row.url,
    title: row.title,
    brand: row.brand,
    retailer: row.retailer,
    imageUrl: row.image_url,
    priceCents: row.price_cents,
    currency: row.currency,
    category: row.category,
    selectedSize: row.selected_size,
    selectedColor: row.selected_color,
    status: row.status,
    sizes,
    checkedAt: new Date(row.checked_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const SAMPLE_PRODUCTS: Array<ProductDraft & { id: string; checkedAt: number; createdAt: number }> = [
  {
    id: "sample-knit",
    url: "https://example.com/products/textured-knit",
    canonicalUrl: "https://example.com/products/textured-knit",
    title: "Textured cotton knit",
    brand: "Studio Nicholson",
    retailer: "Studio Nicholson",
    imageUrl: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1000&q=85",
    priceCents: 16800,
    currency: "USD",
    category: "Tops",
    selectedSize: "S",
    selectedColor: "Ecru",
    status: "in-stock",
    sizes: [{ label: "S", status: "in-stock" }, { label: "M", status: "out-of-stock" }],
    checkedAt: Date.now() - 12 * 60 * 1000,
    createdAt: Date.now() - 3 * 86400000,
  },
  {
    id: "sample-trouser",
    url: "https://example.com/products/pleated-trouser",
    canonicalUrl: "https://example.com/products/pleated-trouser",
    title: "Wide pleated trouser",
    brand: "A Day's March",
    retailer: "A Day's March",
    imageUrl: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1000&q=85",
    priceCents: 12900,
    currency: "USD",
    category: "Bottoms",
    selectedSize: "30",
    selectedColor: "Olive",
    status: "out-of-stock",
    sizes: [{ label: "30", status: "out-of-stock" }, { label: "32", status: "in-stock" }],
    checkedAt: Date.now() - 38 * 60 * 1000,
    createdAt: Date.now() - 2 * 86400000,
  },
  {
    id: "sample-shoe",
    url: "https://example.com/products/suede-trainer",
    canonicalUrl: "https://example.com/products/suede-trainer",
    title: "Low suede trainer",
    brand: "Novesta",
    retailer: "Novesta",
    imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1000&q=85",
    priceCents: 11000,
    currency: "USD",
    category: "Shoes",
    selectedSize: "US 8",
    selectedColor: "Sand",
    status: "unknown",
    sizes: [],
    checkedAt: Date.now() - 2 * 3600000,
    createdAt: Date.now() - 86400000,
  },
];

async function insertDraft(product: ProductDraft, id = crypto.randomUUID(), checkedAt = Date.now(), createdAt = Date.now()) {
  const db = getD1();
  await db.prepare(`INSERT INTO products (
      id, canonical_url, url, title, brand, retailer, image_url, price_cents,
      currency, category, selected_size, selected_color, status, sizes_json, checked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_url) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      brand = excluded.brand,
      retailer = excluded.retailer,
      image_url = excluded.image_url,
      price_cents = excluded.price_cents,
      currency = excluded.currency,
      category = excluded.category,
      selected_size = excluded.selected_size,
      selected_color = excluded.selected_color,
      status = excluded.status,
      sizes_json = excluded.sizes_json,
      checked_at = excluded.checked_at`)
    .bind(
      id,
      product.canonicalUrl,
      product.url,
      product.title,
      product.brand,
      product.retailer,
      product.imageUrl,
      product.priceCents,
      product.currency,
      product.category,
      product.selectedSize,
      product.selectedColor,
      product.status,
      JSON.stringify(product.sizes),
      checkedAt,
      createdAt,
    )
    .run();
  return product.canonicalUrl;
}

export async function listProducts() {
  await ensureProductsTable();
  const db = getD1();
  let result = await db.prepare("SELECT * FROM products ORDER BY created_at DESC").all<ProductRow>();
  if (!result.results.length) {
    for (const sample of SAMPLE_PRODUCTS) {
      await insertDraft(sample, sample.id, sample.checkedAt, sample.createdAt);
    }
    result = await db.prepare("SELECT * FROM products ORDER BY created_at DESC").all<ProductRow>();
  }
  return result.results.map(toProduct);
}

export async function saveProduct(product: ProductDraft) {
  await ensureProductsTable();
  const canonicalUrl = await insertDraft(product);
  const result = await getD1()
    .prepare("SELECT * FROM products WHERE canonical_url = ?")
    .bind(canonicalUrl)
    .first<ProductRow>();
  if (!result) throw new Error("The product could not be saved.");
  return toProduct(result);
}

export async function deleteProduct(id: string) {
  await ensureProductsTable();
  await getD1().prepare("DELETE FROM products WHERE id = ?").bind(id).run();
}

export async function getProduct(id: string) {
  await ensureProductsTable();
  const result = await getD1().prepare("SELECT * FROM products WHERE id = ?").bind(id).first<ProductRow>();
  return result ? toProduct(result) : null;
}
