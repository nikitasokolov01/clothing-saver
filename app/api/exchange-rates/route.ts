import { NextResponse } from "next/server";
import { normalizeCurrency } from "../../../lib/currency";

type RateResponse = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
};

export async function POST(request: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.from) || typeof body.to !== "string") {
    return NextResponse.json({ error: "Provide source and display currencies." }, { status: 400 });
  }

  const to = normalizeCurrency(body.to, "");
  const from = [...new Set(body.from
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeCurrency(value, ""))
    .filter(Boolean))].slice(0, 24);

  if (!to || !from.length) {
    return NextResponse.json({ error: "Currencies must be three-letter ISO codes." }, { status: 400 });
  }

  const rates: Record<string, number> = { [to]: 1 };
  const dates: string[] = [];

  await Promise.all(from.map(async (base) => {
    if (base === to) return;
    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/${base}/${to}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 21_600 },
      });
      if (!response.ok) return;
      const result = await response.json() as RateResponse;
      if (typeof result.rate === "number" && Number.isFinite(result.rate) && result.rate > 0) {
        rates[base] = result.rate;
        if (result.date) dates.push(result.date);
      }
    } catch {
      // A missing rate should never prevent the original retailer price from rendering.
    }
  }));

  return NextResponse.json({
    to,
    rates,
    asOf: dates.sort().at(-1) ?? null,
  });
}
