import {
  enrichGuProductWithInventory,
  enrichShopifyProductWithVariants,
  getGuInventoryUrl,
  getShopifyProductJsonUrl,
  isSafePublicUrl,
  normalizeProductUrl,
  parseProductHtml,
} from "../../../lib/product-extractor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let requestedUrl = "";
  try {
    const payload = (await request.json()) as { url?: string };
    requestedUrl = payload.url?.trim() ?? "";
    if (!requestedUrl) {
      return Response.json({ error: "Paste a product link to continue." }, { status: 400 });
    }

    const normalizedUrl = normalizeProductUrl(requestedUrl);
    if (!isSafePublicUrl(normalizedUrl)) {
      return Response.json({ error: "That link cannot be accessed safely." }, { status: 400 });
    }

    const response = await fetch(normalizedUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return Response.json(
        {
          error: `The retailer returned ${response.status}. You can still add the item manually.`,
          manual: true,
          normalizedUrl,
        },
        { status: 422 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return Response.json(
        { error: "This link does not appear to be a product page.", manual: true, normalizedUrl },
        { status: 422 },
      );
    }

    const html = (await response.text()).slice(0, 2_000_000);
    const sourceUrl = response.url || normalizedUrl;
    let product = parseProductHtml(html, sourceUrl);
    const guInventoryUrl = getGuInventoryUrl(sourceUrl);
    if (guInventoryUrl) {
      try {
        const inventoryResponse = await fetch(guInventoryUrl, {
          headers: {
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            "x-fr-clientid": "gu.us.web-spa",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (inventoryResponse.ok) {
          product = enrichGuProductWithInventory(product, await inventoryResponse.json(), sourceUrl, html);
        }
      } catch {
        // Keep the product details even if GU's separate inventory service is temporarily unavailable.
      }
    }
    const shopifyProductUrl = getShopifyProductJsonUrl(sourceUrl, html);
    if (shopifyProductUrl) {
      try {
        const shopifyResponse = await fetch(shopifyProductUrl, {
          headers: {
            "Accept": "application/json,text/javascript;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (shopifyResponse.ok) {
          product = enrichShopifyProductWithVariants(product, await shopifyResponse.json(), sourceUrl);
        }
      } catch {
        // The page import still works when a Shopify storefront blocks its optional variant feed.
      }
    }
    const hasUsefulData = product.title !== "Untitled product" || !!product.imageUrl || product.priceCents !== null;
    if (!hasUsefulData) {
      return Response.json(
        { error: "I couldn't read product details from this retailer. You can add them manually.", manual: true, normalizedUrl },
        { status: 422 },
      );
    }

    return Response.json({ product });
  } catch (error) {
    const normalizedUrl = (() => {
      try {
        return normalizeProductUrl(requestedUrl);
      } catch {
        return requestedUrl;
      }
    })();
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The retailer took too long to respond. You can add the item manually."
      : "I couldn't read that product page. You can add the item manually.";
    return Response.json({ error: message, manual: true, normalizedUrl }, { status: 422 });
  }
}
