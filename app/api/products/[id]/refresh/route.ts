import { getProduct, saveProduct } from "../../../../../db/products";
import { isSafePublicUrl, parseProductHtml, statusForSize } from "../../../../../lib/product-extractor";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const existing = await getProduct(id);
    if (!existing) return Response.json({ error: "Product not found." }, { status: 404 });
    if (!isSafePublicUrl(existing.url)) {
      return Response.json({ error: "This product link cannot be checked safely." }, { status: 400 });
    }
    const response = await fetch(existing.url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; WardrobeIndex/0.1; availability-check)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("The retailer did not allow an availability check.");
    const fresh = parseProductHtml((await response.text()).slice(0, 2_000_000), response.url || existing.url);
    fresh.selectedSize = existing.selectedSize;
    fresh.selectedColor = existing.selectedColor;
    fresh.category = existing.category;
    fresh.status = statusForSize(fresh.sizes, existing.selectedSize, fresh.status);
    return Response.json({ product: await saveProduct(fresh) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Availability could not be verified." },
      { status: 422 },
    );
  }
}
