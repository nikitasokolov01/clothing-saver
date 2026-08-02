import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  brand: text("brand").notNull().default(""),
  retailer: text("retailer").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  priceCents: integer("price_cents"),
  currency: text("currency").notNull().default("USD"),
  category: text("category").notNull().default("Other"),
  selectedSize: text("selected_size").notNull().default(""),
  selectedColor: text("selected_color").notNull().default(""),
  status: text("status").notNull().default("unknown"),
  sizesJson: text("sizes_json").notNull().default("[]"),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
