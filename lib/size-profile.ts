import type { ProductDraft, StockStatus } from "./types";

export type SizingPreference = "mens" | "womens";
export type SizeProfile = Record<string, string[]>;

export const emptySizeProfile: SizeProfile = {
  Tops: [],
  Outerwear: [],
  Bottoms: [],
  Shoes: [],
  Underwear: [],
};

export const defaultSizeProfile: SizeProfile = {
  ...emptySizeProfile,
  Tops: ["S", "M"],
};

const letterSizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const shoeSizes = (start: number, end: number) => Array.from(
  { length: (end - start) * 2 + 1 },
  (_, index) => `US ${start + index / 2}`,
);
const mensShoeSizes = shoeSizes(6, 13);
const womensShoeSizes = shoeSizes(5, 12);

export function sizeGroupsFor(preference: SizingPreference) {
  return [
    { category: "Tops", options: letterSizes },
    { category: "Outerwear", options: letterSizes },
    {
      category: "Bottoms",
      options: preference === "mens"
        ? ["26", "28", "30", "32", "34", "36", "38", "40"]
        : ["00", "0", "2", "4", "6", "8", "10", "12", "14", "16", "18"],
    },
    {
      category: "Shoes",
      options: preference === "mens" ? mensShoeSizes : womensShoeSizes,
    },
    { category: "Underwear", options: letterSizes },
  ];
}

export function normalizeSize(size: string) {
  const compact = size.trim().toUpperCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "X SMALL": "XS",
    "EXTRA SMALL": "XS",
    SMALL: "S",
    MEDIUM: "M",
    LARGE: "L",
    "X LARGE": "XL",
    "EXTRA LARGE": "XL",
  };
  return aliases[compact] ?? compact;
}

export function matchesSizingPreference(label: string, preference: SizingPreference) {
  const normalized = normalizeSize(label);
  const isWomens = /\b(?:WOMEN|WOMENS|WOMEN'S|FEMALE)\b/.test(normalized) || /\bUS\s+W\s+\d/.test(normalized);
  const isMens = /\b(?:MEN|MENS|MEN'S|MALE)\b/.test(normalized) || /\bUS\s+M\s+\d/.test(normalized);
  if (preference === "mens" && isWomens) return false;
  if (preference === "womens" && isMens) return false;
  return true;
}

function sizeKeys(size: string) {
  const normalized = normalizeSize(size)
    .replace(/\b(?:WOMEN|WOMENS|WOMEN'S|FEMALE|MEN|MENS|MEN'S|MALE)\b/g, "")
    .replace(/\bUS\s+[MW]\s+(?=\d)/g, "US ")
    .replace(/\s+/g, " ")
    .trim();
  const keys = new Set([normalized, normalized.replace(/^US\s+/, "")]);
  if (/\bUS\b/.test(normalized)) {
    for (const number of normalized.match(/\d+(?:\.\d+)?/g) ?? []) keys.add(number);
  }
  return keys;
}

function sizesMatch(left: string, right: string) {
  const leftKeys = sizeKeys(left);
  return [...sizeKeys(right)].some((key) => leftKeys.has(key));
}

const stockRank: Record<StockStatus, number> = {
  "in-stock": 0,
  unknown: 1,
  "out-of-stock": 2,
};

export function preferredSizeForProduct(
  product: Pick<ProductDraft, "category" | "sizes">,
  profile: SizeProfile,
  preference: SizingPreference,
) {
  const preferred = profile[product.category] ?? [];
  return product.sizes
    .filter((option) => matchesSizingPreference(option.label, preference))
    .map((option) => ({
      option,
      preferredIndex: preferred.findIndex((savedSize) => sizesMatch(savedSize, option.label)),
    }))
    .filter(({ preferredIndex }) => preferredIndex >= 0)
    .sort((left, right) => stockRank[left.option.status] - stockRank[right.option.status] || left.preferredIndex - right.preferredIndex)[0]?.option;
}
