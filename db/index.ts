import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB`."
    );
  }

  return env.DB;
}

let initialized = false;

export async function ensureProductsTable() {
  if (initialized) return;
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      canonical_url TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      retailer TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      price_cents INTEGER,
      currency TEXT NOT NULL DEFAULT 'USD',
      category TEXT NOT NULL DEFAULT 'Other',
      selected_size TEXT NOT NULL DEFAULT '',
      selected_color TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unknown',
      sizes_json TEXT NOT NULL DEFAULT '[]',
      checked_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS idx_products_category_status
      ON products(category, status)`),
  ]);
  initialized = true;
}
