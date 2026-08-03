import { createClient } from "npm:@supabase/supabase-js@2.111.0";

type JsonRecord = Record<string, unknown>;

const IMPORT_ENDPOINT = "https://clothing-saver.vercel.app/api/import";
const BATCH_SIZE = 50;
const CONCURRENCY = 4;

function records(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object") : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function sameLabel(left: unknown, right: unknown) {
  return text(left).trim().toLowerCase() === text(right).trim().toLowerCase();
}

function highestPrice(...prices: Array<number | null>) {
  const valid = prices.filter((price): price is number => price !== null && price > 0);
  return valid.length ? Math.max(...valid) : null;
}

function mergedProduct(row: JsonRecord, fresh: JsonRecord) {
  const freshColors = records(fresh.colors);
  const storedColors = records(row.colors);
  const colors = freshColors.length ? freshColors : storedColors;
  const storedColor = text(row.selected_color);
  const refreshedStoredColor = colors.find((color) => sameLabel(color.label, storedColor));
  const refreshedDefaultColor = colors.find((color) => sameLabel(color.label, fresh.selectedColor)) ?? colors[0];
  const color = refreshedStoredColor ?? refreshedDefaultColor;
  const freshSizes = records(fresh.sizes);
  const colorSizes = records(color?.sizes);
  const storedSizes = records(row.sizes);
  const sizes = colorSizes.length ? colorSizes : freshSizes.length ? freshSizes : storedSizes;
  const selectedSize = text(row.selected_size);
  const selectedSizeRow = sizes.find((size) => sameLabel(size.label, selectedSize));
  const oldPrice = numberOrNull(row.price_cents);
  const freshPrice = numberOrNull(color?.priceCents) ?? numberOrNull(fresh.priceCents) ?? oldPrice;
  const dropped = oldPrice !== null && freshPrice !== null && freshPrice < oldPrice;
  const originalPrice = highestPrice(
    numberOrNull(row.original_price_cents),
    numberOrNull(fresh.originalPriceCents),
    numberOrNull(color?.originalPriceCents),
    dropped ? oldPrice : null,
  );

  return {
    title: text(fresh.title) || text(row.title),
    brand: text(fresh.brand) || text(row.brand),
    retailer: text(fresh.retailer) || text(row.retailer),
    image_url: text(color?.imageUrl) || (refreshedStoredColor ? text(row.image_url) : text(fresh.imageUrl)) || text(row.image_url),
    price_cents: freshPrice,
    original_price_cents: originalPrice,
    currency: text(color?.currency) || text(fresh.currency) || text(row.currency),
    selected_color: text(color?.label) || storedColor || text(fresh.selectedColor),
    stock_status: text(selectedSizeRow?.status) || text(fresh.status) || "unknown",
    sizes,
    colors: colors.length ? colors : null,
    checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: "Refresh service is not configured." }, { status: 503 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const now = new Date();
  const { data: lock, error: lockError } = await admin.from("price_refresh_state")
    .update({ locked_until: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), last_started_at: now.toISOString() })
    .eq("id", true)
    .lt("locked_until", now.toISOString())
    .select("id")
    .maybeSingle();

  if (lockError) return Response.json({ error: "Could not acquire refresh lock." }, { status: 500 });
  if (!lock) return Response.json({ ok: true, skipped: true, reason: "A recent refresh already ran." }, { status: 202 });

  let refreshed = 0;
  let failed = 0;
  let priceDrops = 0;

  try {
    const { data: products, error: productsError } = await admin.from("products")
      .select("*")
      .eq("collection", "saved")
      .order("checked_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (productsError) throw productsError;

    const queue = (products ?? []) as JsonRecord[];
    for (let index = 0; index < queue.length; index += CONCURRENCY) {
      const group = queue.slice(index, index + CONCURRENCY);
      await Promise.all(group.map(async (row) => {
        try {
          const response = await fetch(IMPORT_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: row.url }),
            signal: AbortSignal.timeout(20_000),
          });
          if (!response.ok) throw new Error(`Import returned ${response.status}`);
          const payload = await response.json() as JsonRecord;
          const fresh = payload.product && typeof payload.product === "object" ? payload.product as JsonRecord : null;
          if (!fresh) throw new Error("Import returned no product");
          const update = mergedProduct(row, fresh);
          const oldPrice = numberOrNull(row.price_cents);
          const newPrice = numberOrNull(update.price_cents);
          const { error: updateError } = await admin.from("products").update(update).eq("id", row.id);
          if (updateError) throw updateError;
          if (oldPrice !== null && newPrice !== null && newPrice < oldPrice) priceDrops += 1;
          refreshed += 1;
        } catch {
          failed += 1;
        }
      }));
    }

    const result = { checked: queue.length, refreshed, failed, priceDrops };
    await admin.from("price_refresh_state").update({
      locked_until: new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString(),
      last_completed_at: new Date().toISOString(),
      last_result: result,
    }).eq("id", true);
    return Response.json({ ok: true, ...result });
  } catch {
    await admin.from("price_refresh_state").update({ locked_until: new Date().toISOString() }).eq("id", true);
    return Response.json({ error: "The scheduled refresh failed." }, { status: 500 });
  }
});
