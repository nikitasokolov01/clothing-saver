export const displayCurrencies = [
  { code: "USD", label: "US dollar" },
  { code: "CAD", label: "Canadian dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British pound" },
  { code: "JPY", label: "Japanese yen" },
  { code: "CNY", label: "Chinese yuan" },
  { code: "KRW", label: "South Korean won" },
  { code: "AUD", label: "Australian dollar" },
  { code: "NZD", label: "New Zealand dollar" },
  { code: "CHF", label: "Swiss franc" },
  { code: "HKD", label: "Hong Kong dollar" },
  { code: "SGD", label: "Singapore dollar" },
] as const;

export function normalizeCurrency(value: string, fallback = "USD") {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

export function convertCurrencyCents(cents: number, rate: number) {
  return Math.round(cents * rate);
}

export function formatCurrencyCents(cents: number | null, currency: string) {
  if (cents === null) return "Price unavailable";
  const normalized = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalized,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${normalized}`;
  }
}

export function priceForDisplay(
  cents: number | null,
  originalCurrency: string,
  preferredCurrency: string,
  rates: Record<string, number>,
) {
  const original = normalizeCurrency(originalCurrency);
  const preferred = normalizeCurrency(preferredCurrency, "");
  const originalPrice = formatCurrencyCents(cents, original);
  const rate = rates[original];

  if (cents === null || !preferred || preferred === original || !rate) {
    return { primary: originalPrice, secondary: "" };
  }

  return {
    primary: formatCurrencyCents(convertCurrencyCents(cents, rate), preferred),
    secondary: `${originalPrice} ${original} original`,
  };
}
