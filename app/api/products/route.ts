import { listProducts, saveProduct } from "../../../db/products";
import type { ProductDraft, StockStatus } from "../../../lib/types";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set<StockStatus>(["in-stock", "out-of-stock", "unknown"]);

export async function GET() {
  try {
    return Response.json({ products: await listProducts() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Products could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<ProductDraft>;
    if (!payload.url || !payload.canonicalUrl || !payload.title || !payload.retailer) {
      return Response.json({ error: "Link, product name, and retailer are required." }, { status: 400 });
    }
    const status = allowedStatuses.has(payload.status as StockStatus) ? payload.status as StockStatus : "unknown";
    const product: ProductDraft = {
      url: String(payload.url),
      canonicalUrl: String(payload.canonicalUrl),
      title: String(payload.title).trim(),
      brand: String(payload.brand ?? "").trim(),
      retailer: String(payload.retailer).trim(),
      imageUrl: String(payload.imageUrl ?? "").trim(),
      priceCents: typeof payload.priceCents === "number" ? Math.round(payload.priceCents) : null,
      currency: String(payload.currency ?? "USD").trim().toUpperCase().slice(0, 3),
      category: String(payload.category ?? "Other").trim(),
      selectedSize: String(payload.selectedSize ?? "").trim(),
      selectedColor: String(payload.selectedColor ?? "").trim(),
      status,
      sizes: Array.isArray(payload.sizes) ? payload.sizes : [],
    };
    return Response.json({ product: await saveProduct(product) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The product could not be saved." },
      { status: 500 },
    );
  }
}
