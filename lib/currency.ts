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
