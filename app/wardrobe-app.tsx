"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import Image, { type ImageLoaderProps } from "next/image";
import type { User } from "@supabase/supabase-js";
import { convertCurrencyCents, displayCurrencies, normalizeCurrency } from "../lib/currency";
import { productFromRow, productToRow, type ProductRow } from "../lib/product-storage";
import {
  defaultSizeProfile,
  emptySizeProfile,
  matchesSizingPreference,
  normalizeSize,
  preferredSizeForProduct,
  sizeGroupsFor,
  type SizeProfile,
  type SizingPreference,
} from "../lib/size-profile";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import type { ProductDraft, SavedProduct, StockStatus } from "../lib/types";

const categories = ["All", "Tops", "Bottoms", "Shoes", "Outerwear", "Accessories", "Underwear", "Other"];
const storageKey = "clothing-saver:products:v1";
const sizeProfileKey = "clothing-saver:size-profile:v1";
const sourceImageLoader = ({ src }: ImageLoaderProps) => src;

type AccountProfile = {
  userId: string;
  fullName: string;
  username: string;
  sizingPreference: SizingPreference;
  preferredCurrency: string;
  onboardingCompleted: boolean;
};

const samples: SavedProduct[] = [
  {
    id: "sample-knit",
    url: "https://www.uniqlo.com/us/en/men/tops",
    canonicalUrl: "https://www.uniqlo.com/us/en/men/tops",
    title: "Soft brushed crewneck",
    brand: "Uniqlo U",
    retailer: "Uniqlo",
    imageUrl: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=85",
    priceCents: 4990,
    currency: "USD",
    category: "Tops",
    selectedSize: "S",
    selectedColor: "Charcoal",
    status: "in-stock",
    sizes: [{ label: "S", status: "in-stock" }],
    collection: "saved",
    purchasedAt: null,
    checkedAt: "2026-08-02T13:40:00.000Z",
    createdAt: "2026-08-01T15:00:00.000Z",
  },
  {
    id: "sample-jacket",
    url: "https://www.cos.com/en_usd/men/menswear/coats-and-jackets.html",
    canonicalUrl: "https://www.cos.com/en_usd/men/menswear/coats-and-jackets.html",
    title: "Relaxed utility jacket",
    brand: "COS",
    retailer: "COS",
    imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=85",
    priceCents: 13500,
    currency: "USD",
    category: "Outerwear",
    selectedSize: "S",
    selectedColor: "Stone",
    status: "out-of-stock",
    sizes: [{ label: "S", status: "out-of-stock" }],
    collection: "saved",
    purchasedAt: null,
    checkedAt: "2026-08-02T11:10:00.000Z",
    createdAt: "2026-07-30T18:20:00.000Z",
  },
  {
    id: "sample-shoes",
    url: "https://www.newbalance.com/men/shoes/lifestyle/",
    canonicalUrl: "https://www.newbalance.com/men/shoes/lifestyle/",
    title: "Suede everyday sneakers",
    brand: "New Balance",
    retailer: "New Balance",
    imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=85",
    priceCents: 11999,
    currency: "USD",
    category: "Shoes",
    selectedSize: "US 9",
    selectedColor: "Sand",
    status: "unknown",
    sizes: [],
    collection: "saved",
    purchasedAt: null,
    checkedAt: "2026-08-01T21:30:00.000Z",
    createdAt: "2026-07-29T12:00:00.000Z",
  },
];

const emptyDraft = (url = ""): ProductDraft => ({
  url,
  canonicalUrl: url,
  title: "",
  brand: "",
  retailer: retailerFromUrl(url),
  imageUrl: "",
  priceCents: null,
  currency: "USD",
  category: "Other",
  selectedSize: "",
  selectedColor: "",
  status: "unknown",
  sizes: [],
});

function retailerFromUrl(raw: string) {
  try {
    const root = new URL(raw).hostname.replace(/^www\./, "").split(".")[0];
    return root.charAt(0).toUpperCase() + root.slice(1).replace(/[-_]/g, " ");
  } catch {
    return "";
  }
}

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return "Price unavailable";
  const normalizedCurrency = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: normalizedCurrency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${normalizedCurrency}`;
  }
}

function productPrice(product: SavedProduct, preferredCurrency: string, rates: Record<string, number>, rateTarget: string) {
  const originalCurrency = normalizeCurrency(product.currency);
  const displayCurrency = normalizeCurrency(preferredCurrency);
  const original = formatMoney(product.priceCents, originalCurrency);
  if (product.priceCents === null || originalCurrency === displayCurrency) {
    return { primary: original, secondary: "" };
  }
  const rate = rateTarget === displayCurrency ? rates[originalCurrency] : undefined;
  if (!rate) return { primary: original, secondary: "" };
  return {
    primary: `${formatMoney(convertCurrencyCents(product.priceCents, rate), displayCurrency)} ${displayCurrency}`,
    secondary: `${original} ${originalCurrency} original`,
  };
}

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusCopy(status: StockStatus, size: string) {
  if (status === "in-stock") return size ? `Size ${size} in stock` : "In stock";
  if (status === "out-of-stock") return size ? `Size ${size} out of stock` : "Out of stock";
  return size ? `Size ${size} not verified` : "Availability unknown";
}

function withVariant(url: string, variantId?: string) {
  if (!variantId) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("variant", variantId);
    return parsed.toString();
  } catch {
    return url;
  }
}

function availabilityForProduct(product: SavedProduct, profile: SizeProfile) {
  if (product.selectedSize) {
    return { status: product.status, label: statusCopy(product.status, product.selectedSize) };
  }
  const preferred = profile[product.category] ?? [];
  if (!preferred.length || !product.sizes.length) {
    return { status: product.status, label: statusCopy(product.status, "") };
  }
  const preferredSet = new Set(preferred.map(normalizeSize));
  const matching = product.sizes.filter((size) => preferredSet.has(normalizeSize(size.label)));
  if (!matching.length) return { status: "unknown" as const, label: "Your sizes are not listed" };
  const available = matching.filter((size) => size.status === "in-stock").map((size) => size.label);
  if (available.length) {
    return { status: "in-stock" as const, label: `${available.join(" + ")} available in your sizes` };
  }
  if (matching.every((size) => size.status === "out-of-stock")) {
    return { status: "out-of-stock" as const, label: "Your sizes are out of stock" };
  }
  return { status: "unknown" as const, label: "Your size availability is unclear" };
}

function ProductImage({ product }: { product: Pick<SavedProduct, "imageUrl" | "title" | "category"> }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) {
    return (
      <div className="product-placeholder" aria-label={`No image available for ${product.title}`}>
        <span>{product.category.slice(0, 1)}</span>
        <small>Image unavailable</small>
      </div>
    );
  }
  return <Image loader={sourceImageLoader} src={product.imageUrl} alt={product.title} fill sizes="(max-width: 820px) 40vw, 240px" unoptimized onError={() => setFailed(true)} />;
}

export function WardrobeApp() {
  const [products, setProducts] = useState<SavedProduct[]>(samples);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [collection, setCollection] = useState<"saved" | "closet">("saved");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "importing" | "review" | "saving">("idle");
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft());
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState("");
  const [colorLoading, setColorLoading] = useState("");
  const [sizeProfile, setSizeProfile] = useState<SizeProfile>(defaultSizeProfile);
  const [profileDraft, setProfileDraft] = useState<SizeProfile>(defaultSizeProfile);
  const [profileSizing, setProfileSizing] = useState<SizingPreference>("mens");
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingUsername, setOnboardingUsername] = useState("");
  const [onboardingSizing, setOnboardingSizing] = useState<SizingPreference>("mens");
  const [onboardingCurrency, setOnboardingCurrency] = useState("USD");
  const [onboardingSizes, setOnboardingSizes] = useState<SizeProfile>(emptySizeProfile);
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [currencyPending, setCurrencyPending] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ USD: 1 });
  const [exchangeRateTarget, setExchangeRateTarget] = useState("USD");
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authIdentifier, setAuthIdentifier] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const supabase = useMemo(() => isSupabaseConfigured ? createClient() : null, []);

  useEffect(() => {
    if (supabase) {
      let active = true;
      const loadAccount = async (account: User) => {
        setLoading(true);
        const [productsResult, profileResult] = await Promise.all([
          supabase.from("products").select("*").order("created_at", { ascending: false }),
          supabase.from("profiles").select("full_name,username,sizing_preference,preferred_currency,onboarding_completed,size_profile").eq("user_id", account.id).maybeSingle(),
        ]);
        if (!active) return;
        if (productsResult.error) setError(productsResult.error.message);
        else setProducts((productsResult.data as ProductRow[]).map(productFromRow));
        if (profileResult.error) setError(profileResult.error.message);
        else {
          const row = profileResult.data;
          const savedSizes = row?.size_profile ? row.size_profile as SizeProfile : emptySizeProfile;
          const sizing = row?.sizing_preference === "womens" ? "womens" : "mens";
          const profile = row ? {
            userId: account.id,
            fullName: row.full_name || "",
            username: row.username || "",
            sizingPreference: sizing,
            preferredCurrency: normalizeCurrency(row.preferred_currency || "USD"),
            onboardingCompleted: Boolean(row.onboarding_completed),
          } satisfies AccountProfile : null;
          setSizeProfile(savedSizes);
          setAccountProfile(profile);
          if (!profile?.onboardingCompleted) {
            setOnboardingName(profile?.fullName || "");
            setOnboardingUsername(profile?.username || "");
            setOnboardingSizing(sizing);
            setOnboardingCurrency(profile?.preferredCurrency || "USD");
            setOnboardingSizes(savedSizes);
            setOnboardingStep(1);
            setOnboardingOpen(true);
          } else {
            setOnboardingOpen(false);
          }
        }
        setLoading(false);
      };
      const initialize = async () => {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError && authError.name !== "AuthSessionMissingError") setError(authError.message);
        setUser(data.user);
        if (data.user) await loadAccount(data.user);
        else {
          setProducts([]);
          setAccountProfile(null);
          setOnboardingOpen(false);
          setLoading(false);
        }
      };
      void initialize();
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        if (session?.user) window.setTimeout(() => void loadAccount(session.user), 0);
        else {
          setProducts([]);
          setAccountProfile(null);
          setOnboardingOpen(false);
          setLoading(false);
        }
      });
      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    }

    const loadSavedProducts = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const localProducts = JSON.parse(saved) as Array<Partial<SavedProduct> & ProductDraft & { id: string; checkedAt: string; createdAt: string }>;
          setProducts(localProducts.map((product) => ({
            ...product,
            collection: product.collection ?? "saved",
            purchasedAt: product.purchasedAt ?? null,
          })) as SavedProduct[]);
        }
        else window.localStorage.setItem(storageKey, JSON.stringify(samples));
        const savedProfile = window.localStorage.getItem(sizeProfileKey);
        if (savedProfile) setSizeProfile(JSON.parse(savedProfile) as SizeProfile);
        else window.localStorage.setItem(sizeProfileKey, JSON.stringify(defaultSizeProfile));
      } catch {
        setError("Your browser could not load the locally saved list.");
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(loadSavedProducts);
  }, [supabase]);

  const preferredCurrency = accountProfile?.preferredCurrency ?? "USD";

  useEffect(() => {
    const from = [...new Set(products
      .map((product) => normalizeCurrency(product.currency, ""))
      .filter((currency) => currency && currency !== preferredCurrency))];
    if (!from.length) return;

    const controller = new AbortController();
    void fetch("/api/exchange-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: preferredCurrency }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { rates?: Record<string, number> };
      if (result.rates) {
        setExchangeRates(result.rates);
        setExchangeRateTarget(preferredCurrency);
      }
    }).catch(() => {
      // Cards continue to show their original prices while rates are unavailable.
    });
    return () => controller.abort();
  }, [preferredCurrency, products]);

  useEffect(() => {
    if (!dialogOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stage !== "importing" && stage !== "saving") closeDialog();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [dialogOpen, stage]);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const collectionMatches = product.collection === collection;
      const categoryMatches = filter === "All" || product.category === filter;
      const textMatches = !needle || `${product.title} ${product.brand} ${product.retailer} ${product.selectedColor}`.toLowerCase().includes(needle);
      return collectionMatches && categoryMatches && textMatches;
    });
  }, [collection, filter, products, query]);
  const sizingPreference = accountProfile?.sizingPreference ?? "mens";
  const displayedDraftSizes = draft.sizes.filter((size) => matchesSizingPreference(size.label, sizingPreference));

  function commitLocalProducts(next: SavedProduct[]) {
    setProducts(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setError("This change could not be saved in your browser.");
    }
  }

  function openSizeProfile() {
    if (supabase && !user) {
      setAuthOpen(true);
      setNotice("Log in to save a size profile to your account.");
      return;
    }
    setProfileDraft(Object.fromEntries(Object.entries(sizeProfile).map(([category, sizes]) => [category, [...sizes]])));
    setProfileSizing(accountProfile?.sizingPreference ?? "mens");
    setProfileOpen(true);
  }

  function toggleProfileSize(category: string, size: string) {
    const current = profileDraft[category] ?? [];
    const next = current.includes(size) ? current.filter((item) => item !== size) : [...current, size];
    setProfileDraft({ ...profileDraft, [category]: next });
  }

  function chooseProfileSizing(preference: SizingPreference) {
    if (preference === profileSizing) return;
    setProfileSizing(preference);
    setProfileDraft((current) => ({ ...current, Bottoms: [], Shoes: [] }));
  }

  async function saveSizeProfile() {
    setSizeProfile(profileDraft);
    if (supabase && user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        user_id: user.id,
        size_profile: profileDraft,
        sizing_preference: profileSizing,
        updated_at: new Date().toISOString(),
      });
      if (profileError) {
        setError(profileError.message);
        return;
      }
      setAccountProfile((current) => current ? { ...current, sizingPreference: profileSizing } : current);
      setNotice("Your size profile was saved to your account.");
    } else try {
      window.localStorage.setItem(sizeProfileKey, JSON.stringify(profileDraft));
      setNotice("Your size profile was saved.");
    } catch {
      setError("Your size profile could not be saved in this browser.");
    }
    setProfileOpen(false);
  }

  function openAccountProfile() {
    setAuthOpen(false);
    setOnboardingName(accountProfile?.fullName || "");
    setOnboardingUsername(accountProfile?.username || "");
    setOnboardingSizing(accountProfile?.sizingPreference ?? "mens");
    setOnboardingCurrency(accountProfile?.preferredCurrency ?? "USD");
    setOnboardingSizes(Object.fromEntries(Object.entries(sizeProfile).map(([category, sizes]) => [category, [...sizes]])));
    setOnboardingStep(1);
    setOnboardingOpen(true);
  }

  function toggleOnboardingSize(category: string, size: string) {
    const current = onboardingSizes[category] ?? [];
    const next = current.includes(size) ? current.filter((item) => item !== size) : [...current, size];
    setOnboardingSizes({ ...onboardingSizes, [category]: next });
  }

  function continueOnboarding() {
    setError("");
    if (onboardingStep === 1) {
      if (!onboardingName.trim()) {
        setError("Please add your name.");
        return;
      }
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(onboardingUsername.trim())) {
        setError("Usernames must be 3–24 characters and use only letters, numbers, or underscores.");
        return;
      }
    }
    setOnboardingStep((step) => Math.min(3, step + 1));
  }

  function chooseOnboardingSizing(preference: SizingPreference) {
    setOnboardingSizing(preference);
    setOnboardingSizes((current) => ({ ...current, Bottoms: [], Shoes: [] }));
  }

  async function savePreferredCurrency(currency: string) {
    if (!supabase || !user || currency === preferredCurrency) return;
    const previous = preferredCurrency;
    setCurrencyPending(true);
    setAccountProfile((current) => current ? { ...current, preferredCurrency: currency } : current);
    const { error: profileError } = await supabase.from("profiles").update({
      preferred_currency: currency,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    setCurrencyPending(false);
    if (profileError) {
      setAccountProfile((current) => current ? { ...current, preferredCurrency: previous } : current);
      setError(profileError.message);
      return;
    }
    setNotice(`Saved prices will now display in ${currency}.`);
  }

  async function finishOnboarding() {
    if (!supabase || !user) return;
    const fullName = onboardingName.trim();
    const username = onboardingUsername.trim().toLowerCase();
    if (!fullName) {
      setError("Please add your name.");
      setOnboardingStep(1);
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setError("Usernames must be 3–24 characters and use only lowercase letters, numbers, or underscores.");
      setOnboardingStep(1);
      return;
    }
    setOnboardingPending(true);
    setError("");
    const { data, error: profileError } = await supabase.from("profiles").upsert({
      user_id: user.id,
      full_name: fullName,
      username,
      sizing_preference: onboardingSizing,
      preferred_currency: onboardingCurrency,
      size_profile: onboardingSizes,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }).select("full_name,username,sizing_preference,preferred_currency,onboarding_completed,size_profile").single();
    setOnboardingPending(false);
    if (profileError) {
      setError(profileError.code === "23505" ? "That username is already taken. Try another one." : profileError.message);
      if (profileError.code === "23505") setOnboardingStep(1);
      return;
    }
    setAccountProfile({
      userId: user.id,
      fullName: data.full_name,
      username: data.username,
      sizingPreference: data.sizing_preference as SizingPreference,
      preferredCurrency: normalizeCurrency(data.preferred_currency),
      onboardingCompleted: true,
    });
    setSizeProfile(data.size_profile as SizeProfile);
    setOnboardingOpen(false);
    setNotice(accountProfile?.onboardingCompleted ? "Your profile was updated." : "You’re all set. Welcome to Saved.");
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthPending(true);
    setError("");
    const identifier = authIdentifier.trim();
    if (authMode === "signup" && !identifier.includes("@")) {
      setAuthPending(false);
      setError("Use your email address to create an account.");
      return;
    }
    let result;
    if (authMode === "login" && !identifier.includes("@")) {
      const { data, error: functionError } = await supabase.functions.invoke("login-with-username", {
        body: { username: identifier.toLowerCase(), password: authPassword },
      });
      if (functionError || !data?.access_token || !data?.refresh_token) {
        setAuthPending(false);
        setError("Invalid username or password.");
        return;
      }
      result = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    } else {
      result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: identifier, password: authPassword })
        : await supabase.auth.signUp({ email: identifier, password: authPassword });
    }
    setAuthPending(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (authMode === "signup" && !result.data.session) {
      setNotice("Check your email to confirm your new account, then log in.");
      setAuthMode("login");
      return;
    }
    setAuthOpen(false);
    setAuthPassword("");
    setNotice(authMode === "login" ? "Welcome back." : "Your account is ready.");
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else {
      setAuthOpen(false);
      setNotice("You are signed out.");
    }
  }

  async function beginImport(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    if (supabase && !user) {
      setAuthOpen(true);
      setNotice("Log in so this piece can be saved to your account.");
      return;
    }
    setDialogOpen(true);
    setStage("importing");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) {
        setDraft(emptyDraft(data.normalizedUrl || url));
        setError(data.error || "This retailer's page could not be read.");
      } else {
        const product = data.product as ProductDraft;
        const preferredSize = preferredSizeForProduct(product, sizeProfile, accountProfile?.sizingPreference ?? "mens");
        const autoSelected = preferredSize ?? (product.sizes.length === 1 ? product.sizes[0] : undefined);
        if (autoSelected) {
          product.selectedSize = autoSelected.label;
          product.status = autoSelected.status;
          product.url = autoSelected.url || withVariant(product.url, autoSelected.variantId);
        }
        setDraft(product);
        const preferred = new Set((sizeProfile[product.category] ?? []).map(normalizeSize));
        const availableMatches = product.sizes
          .filter((size) => preferred.has(normalizeSize(size.label)) && size.status === "in-stock")
          .map((size) => size.label);
        setNotice(preferredSize
          ? preferredSize.status === "in-stock"
            ? `Good news - size ${preferredSize.label} is available and was selected for you.`
            : `Size ${preferredSize.label} matches your profile and was selected for tracking.`
          : availableMatches.length
          ? `Good news — ${availableMatches.join(" and ")} are available in your sizes.`
          : product.sizes.length
            ? "Details and sizes found. You can track one size or use your size profile."
            : "Details found. Add a size if you want to track one.");
      }
    } catch {
      setDraft(emptyDraft(url));
      setError("The page could not be reached. You can still add the details manually.");
    } finally {
      setStage("review");
    }
  }

  function chooseSize(size: string) {
    const matching = draft.sizes.find((option) => option.label === size);
    setDraft({
      ...draft,
      url: matching?.url || withVariant(draft.url, matching?.variantId),
      selectedSize: size,
      status: matching?.status ?? "unknown",
    });
  }

  async function chooseColor(colorLabel: string) {
    const color = draft.colors?.find((option) => option.label === colorLabel);
    if (!color) return;
    if (!color.sizes.length && color.url) {
      setColorLoading(colorLabel);
      setError("");
      try {
        const response = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: color.url }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This color could not be loaded.");
        const product = data.product as ProductDraft;
        const preferredSize = preferredSizeForProduct(product, sizeProfile, sizingPreference);
        if (preferredSize) {
          product.selectedSize = preferredSize.label;
          product.status = preferredSize.status;
          product.url = preferredSize.url || withVariant(product.url, preferredSize.variantId);
        }
        setDraft({ ...product, canonicalUrl: draft.canonicalUrl });
        setNotice(preferredSize ? `Loaded ${colorLabel} and selected ${preferredSize.label} from your size profile.` : `Loaded sizes for ${colorLabel}.`);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "This color could not be loaded.");
      } finally {
        setColorLoading("");
      }
      return;
    }
    const matchingSize = color.sizes.find((option) => option.label === draft.selectedSize && matchesSizingPreference(option.label, sizingPreference))
      ?? preferredSizeForProduct({ category: draft.category, sizes: color.sizes }, sizeProfile, sizingPreference);
    setDraft({
      ...draft,
      url: matchingSize?.url || color.url || withVariant(draft.url, matchingSize?.variantId ?? color.variantId),
      imageUrl: color.imageUrl || draft.imageUrl,
      selectedColor: color.label,
      sizes: color.sizes,
      selectedSize: matchingSize?.label ?? "",
      status: matchingSize?.status ?? "unknown",
    });
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft.url.trim() || !draft.title.trim() || !draft.retailer.trim()) {
      setError("Add a product link, name, and retailer before saving.");
      return;
    }
    setStage("saving");
    const now = new Date().toISOString();
    const existing = products.find((product) => product.id === editingId)
      ?? products.find((product) => product.canonicalUrl === draft.canonicalUrl || product.url === draft.url);
    const product: SavedProduct = {
      ...draft,
      currency: normalizeCurrency(draft.currency),
      id: existing?.id ?? crypto.randomUUID(),
      collection: existing?.collection ?? "saved",
      purchasedAt: existing?.purchasedAt ?? null,
      checkedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    if (supabase && user) {
      const productRow = productToRow(product, user.id);
      const { data, error: saveError } = editingId
        ? await supabase.from("products").update(productRow).eq("id", editingId).eq("user_id", user.id).select().single()
        : await supabase.from("products").upsert(productRow, { onConflict: "user_id,canonical_url" }).select().single();
      if (saveError) {
        setError(saveError.message);
        setStage("review");
        return;
      }
      const saved = productFromRow(data as ProductRow);
      setProducts(editingId
        ? products.map((item) => item.id === editingId ? saved : item)
        : [saved, ...products.filter((item) => item.id !== saved.id && item.canonicalUrl !== saved.canonicalUrl)]);
    } else {
      commitLocalProducts(editingId
        ? products.map((item) => item.id === editingId ? product : item)
        : [product, ...products.filter((item) => item.id !== product.id)]);
    }
    setUrl("");
    closeDialog();
    setNotice(existing ? `${product.title} was updated.` : `${product.title} was saved.`);
  }

  async function removeProduct(product: SavedProduct) {
    if (supabase && user) {
      const { error: removeError } = await supabase.from("products").delete().eq("id", product.id).eq("user_id", user.id);
      if (removeError) {
        setError(removeError.message);
        return;
      }
      setProducts(products.filter((item) => item.id !== product.id));
    } else {
      commitLocalProducts(products.filter((item) => item.id !== product.id));
    }
    setNotice(`${product.title} was removed.`);
  }

  async function moveProduct(product: SavedProduct, destination: "saved" | "closet") {
    const purchasedAt = destination === "closet" ? new Date().toISOString() : null;
    const updated = { ...product, collection: destination, purchasedAt };
    if (supabase && user) {
      const { error: moveError } = await supabase.from("products").update({
        collection: destination,
        purchased_at: purchasedAt,
        updated_at: new Date().toISOString(),
      }).eq("id", product.id).eq("user_id", user.id);
      if (moveError) {
        setError(moveError.message);
        return;
      }
      setProducts(products.map((item) => item.id === product.id ? updated : item));
    } else {
      commitLocalProducts(products.map((item) => item.id === product.id ? updated : item));
    }
    setNotice(destination === "closet" ? `${product.title} was added to your closet.` : `${product.title} moved back to saved pieces.`);
  }

  async function refreshProduct(product: SavedProduct) {
    if (product.url.includes("example.com")) return;
    setRefreshingId(product.id);
    setError("");
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Availability could not be checked.");
      const fresh = data.product as ProductDraft;
      const size = fresh.sizes.find((option) => option.label.toLowerCase() === product.selectedSize.toLowerCase());
      const updated: SavedProduct = {
        ...product,
        title: fresh.title || product.title,
        brand: fresh.brand || product.brand,
        retailer: fresh.retailer || product.retailer,
        imageUrl: fresh.imageUrl || product.imageUrl,
        priceCents: fresh.priceCents ?? product.priceCents,
        currency: fresh.currency || product.currency,
        selectedColor: fresh.selectedColor || product.selectedColor,
        colors: fresh.colors ?? product.colors,
        sizes: fresh.sizes,
        status: size?.status ?? fresh.status,
        checkedAt: new Date().toISOString(),
      };
      if (supabase && user) {
        const { error: updateError } = await supabase.from("products").update(productToRow(updated, user.id)).eq("id", product.id).eq("user_id", user.id);
        if (updateError) throw updateError;
        setProducts(products.map((item) => item.id === product.id ? updated : item));
      } else {
        commitLocalProducts(products.map((item) => item.id === product.id ? updated : item));
      }
      setNotice(`Checked ${product.title}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Availability could not be checked.");
    } finally {
      setRefreshingId("");
    }
  }

  function openManual() {
    if (supabase && !user) {
      setAuthOpen(true);
      setNotice("Log in so this piece can be saved to your account.");
      return;
    }
    setDraft(emptyDraft(url));
    setError("");
    setNotice("Add whatever the retailer page did not provide.");
    setDialogOpen(true);
    setStage("review");
  }

  function editProduct(product: SavedProduct) {
    setEditingId(product.id);
    setDraft({ ...product });
    setError("");
    setNotice("");
    setDialogOpen(true);
    setStage("review");
  }

  function closeDialog() {
    setDialogOpen(false);
    setStage("idle");
    setDraft(emptyDraft());
    setEditingId("");
    setError("");
    setNotice("");
    setColorLoading("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Saved wardrobe home">
          <span className="brand-mark">s</span>
          <span>Saved</span>
        </a>
        <div className="topbar-actions">
          {user && <a className="profile-button social-shortcut" href="/feed">Feed</a>}
          {user && <a className="profile-button social-shortcut" href="/notifications">Inbox</a>}
          <button className="profile-button" type="button" onClick={openSizeProfile}>My sizes</button>
          {supabase ? (
            <button className="account-button" type="button" onClick={() => setAuthOpen(true)}>
              <span className="account-avatar">{accountProfile?.fullName.slice(0, 1).toUpperCase() || user?.email?.slice(0, 1).toUpperCase() || "?"}</span>
              <span>{accountProfile?.fullName || accountProfile?.username || (user ? "My account" : "Log in")}</span>
            </button>
          ) : <div className="local-badge"><span /> Local preview</div>}
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="kicker">Your personal wardrobe shortlist</p>
          <h1>Things you like,<br />{" "}all in one place.</h1>
        </div>
        <div className="intro-count"><strong>{products.filter((product) => product.collection === "saved").length}</strong><span>saved pieces</span></div>
      </section>

      <form className="import-pill" onSubmit={beginImport}>
        <span className="link-icon" aria-hidden="true">↗</span>
        <label className="sr-only" htmlFor="product-url">Product link</label>
        <input id="product-url" type="url" placeholder="Paste a product link" value={url} onChange={(event) => setUrl(event.target.value)} required />
        <button type="submit">Import</button>
      </form>

      <div className="under-import">
        <span>Picture, price and sizes are pulled in for you.</span>
        <button type="button" onClick={openManual}>Add manually</button>
      </div>

      <section className="wardrobe" aria-labelledby="wardrobe-title">
        <div className="collection-tabs" aria-label="Choose a collection">
          <button type="button" className={collection === "saved" ? "active" : ""} onClick={() => setCollection("saved")}>
            Saved <span>{products.filter((product) => product.collection === "saved").length}</span>
          </button>
          <button type="button" className={collection === "closet" ? "active" : ""} onClick={() => setCollection("closet")}>
            Closet <span>{products.filter((product) => product.collection === "closet").length}</span>
          </button>
        </div>
        <div className="section-heading">
          <div>
            <p className="kicker">{collection === "saved" ? "Your shortlist" : "Your inventory"}</p>
            <h2 id="wardrobe-title">{collection === "saved" ? "Saved pieces" : "My closet"}</h2>
          </div>
          <label className="search-pill">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search saved products</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>
        </div>

        <div className="filters" aria-label="Filter by category">
          {categories.map((category) => (
            <button type="button" className={filter === category ? "active" : ""} aria-pressed={filter === category} onClick={() => setFilter(category)} key={category}>
              {category}
            </button>
          ))}
        </div>

        {notice && <div className="toast success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
        {error && !dialogOpen && <div className="toast error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

        {supabase && !user ? (
          <div className="account-gate">
            <span className="account-gate-mark">s</span>
            <p className="kicker">Your private collection</p>
            <h3>Log in to see your pieces.</h3>
            <p>Every saved item and closet purchase stays connected to your account.</p>
            <button type="button" onClick={() => setAuthOpen(true)}>Log in or create an account</button>
          </div>
        ) : loading ? (
          <div className="product-grid" aria-label="Loading saved products">{[0, 1, 2].map((number) => <div className="loading-card" key={number} />)}</div>
        ) : visibleProducts.length ? (
          <div className="product-grid">
            {visibleProducts.map((product, index) => {
              const availability = availabilityForProduct(product, sizeProfile);
              const price = productPrice(product, preferredCurrency, exchangeRates, exchangeRateTarget);
              return (
              <article className={`product-pill tone-${index % 4}`} key={product.id} style={{ "--delay": `${index * 55}ms` } as CSSProperties}>
                <a className="pill-hit-area" href={product.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${product.title} at ${product.retailer} in a new tab`} />
                <div className="product-photo"><ProductImage product={product} /></div>
                <div className="product-copy">
                  <div className="product-topline">
                    <span>{product.brand || product.retailer}</span>
                    <span>{product.category}</span>
                  </div>
                  <h3>{product.title}</h3>
                  <div className="price-block">
                    <p className="price">{price.primary}</p>
                    {price.secondary && <small>{price.secondary}</small>}
                  </div>
                  <div className="pill-tags">
                    <span className={`stock-tag ${availability.status}`}>{availability.label}</span>
                    {product.selectedColor && <span className="soft-tag">{product.selectedColor}</span>}
                  </div>
                  <div className="card-meta">
                    <button type="button" onClick={() => refreshProduct(product)} disabled={refreshingId === product.id} aria-label={`Refresh ${product.title}`}>
                      <span className={refreshingId === product.id ? "spinning" : ""}>↻</span> {refreshingId === product.id ? "Checking" : `Checked ${timeAgo(product.checkedAt)}`}
                    </button>
                    <div className="card-actions">
                      {collection === "saved" && <button className="edit-button" type="button" onClick={() => editProduct(product)}>Edit</button>}
                      <button className="closet-button" type="button" onClick={() => moveProduct(product, collection === "saved" ? "closet" : "saved")}>
                        {collection === "saved" ? "Mark bought" : "Move to saved"}
                      </button>
                      <button className="remove-button" type="button" onClick={() => removeProduct(product)}>Remove</button>
                    </div>
                  </div>
                </div>
                <span className="open-arrow" aria-hidden="true">↗</span>
              </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span>Nothing here</span>
            <h3>{query || filter !== "All" ? "Try another filter." : collection === "closet" ? "Nothing in your closet yet." : "Save your first piece."}</h3>
            <button type="button" onClick={() => { setCollection("saved"); setFilter("All"); setQuery(""); document.getElementById("product-url")?.focus(); }}>{collection === "closet" ? "Browse saved pieces" : "Add something"}</button>
          </div>
        )}
      </section>

      <footer>
        <span>{supabase ? user ? `Synced as ${accountProfile?.username ? `@${accountProfile.username}` : user.email}` : "Log in to sync your collection" : "Local preview mode"}</span>
        <span>{supabase ? "Protected per account with Supabase" : "Add Supabase keys to enable accounts"}</span>
      </footer>

      {authOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !authPending) setAuthOpen(false); }}>
          <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="dialog-close" type="button" onClick={() => setAuthOpen(false)} disabled={authPending} aria-label="Close account dialog">×</button>
            {user ? (
              <div className="account-panel">
                <span className="account-large-avatar">{accountProfile?.fullName.slice(0, 1).toUpperCase() || user.email?.slice(0, 1).toUpperCase()}</span>
                <p className="kicker">Your account</p>
                <h2 id="auth-title">{accountProfile?.fullName || "You’re logged in."}</h2>
                <p>{accountProfile?.username ? `@${accountProfile.username} · ${user.email}` : user.email}</p>
                <div className="account-stats">
                  <span><strong>{products.filter((product) => product.collection === "saved").length}</strong> saved</span>
                  <span><strong>{products.filter((product) => product.collection === "closet").length}</strong> in closet</span>
                </div>
                <label className="account-currency">
                  <span>Display prices in</span>
                  <select value={preferredCurrency} onChange={(event) => void savePreferredCurrency(event.target.value)} disabled={currencyPending}>
                    {displayCurrencies.map((currency) => <option value={currency.code} key={currency.code}>{currency.code} — {currency.label}</option>)}
                  </select>
                  <small>Retailer prices stay saved in their original currency.</small>
                </label>
                <div className="account-actions">
                  {accountProfile?.username && <a className="secondary-button" href={`/u/${accountProfile.username}`}>View & share profile</a>}
                  <button className="secondary-button" type="button" onClick={openAccountProfile}>Edit profile</button>
                  <button className="secondary-button" type="button" onClick={signOut}>Log out</button>
                </div>
              </div>
            ) : (
              <form className="auth-form" onSubmit={submitAuth}>
                <p className="kicker">Private by default</p>
                <h2 id="auth-title">{authMode === "login" ? "Welcome back." : "Create your account."}</h2>
                <p>Your saved pieces, sizes and closet will follow you between devices.</p>
                {notice && <div className="form-message success">{notice}</div>}
                {error && <div className="form-message error">{error}</div>}
                <label>{authMode === "login" ? "Email or username" : "Email"}<input type={authMode === "login" ? "text" : "email"} autoComplete={authMode === "login" ? "username" : "email"} value={authIdentifier} onChange={(event) => setAuthIdentifier(event.target.value)} required /></label>
                <label>Password<input type="password" minLength={6} autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required /></label>
                <button className="primary-button" type="submit" disabled={authPending}>{authPending ? "Please wait…" : authMode === "login" ? "Log in" : "Create account"}</button>
                <button className="auth-switch" type="button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
                  {authMode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}

      {onboardingOpen && user && (
        <div className="dialog-backdrop onboarding-backdrop">
          <section className="dialog onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            {accountProfile?.onboardingCompleted && (
              <button className="dialog-close" type="button" onClick={() => setOnboardingOpen(false)} disabled={onboardingPending} aria-label="Close profile editor">×</button>
            )}
            <div className="onboarding-progress" aria-label={`Step ${onboardingStep} of 3`}>
              {[1, 2, 3].map((step) => <span className={step <= onboardingStep ? "active" : ""} key={step} />)}
            </div>

            {onboardingStep === 1 && (
              <div className="onboarding-step">
                <p className="kicker">Let’s get started</p>
                <h2 id="onboarding-title">First, what should we call you?</h2>
                <p>Your name appears in the app. Your username gives you a quicker way to log in later.</p>
                <div className="onboarding-fields">
                  <label>Your name<input autoComplete="name" value={onboardingName} onChange={(event) => setOnboardingName(event.target.value)} placeholder="firstname" autoFocus /></label>
                  <label>Username<div className="username-input"><span>@</span><input autoComplete="username" value={onboardingUsername} onChange={(event) => setOnboardingUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="username" /></div><small>3–24 characters. Letters, numbers and underscores only.</small></label>
                </div>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="onboarding-step">
                <p className="kicker">Your fit</p>
                <h2 id="onboarding-title">Which sizing do you usually shop?</h2>
                <p>We’ll use this preference when a retailer lists men’s and women’s variants separately.</p>
                <div className="sizing-choice">
                  <button type="button" className={onboardingSizing === "mens" ? "selected" : ""} onClick={() => chooseOnboardingSizing("mens")}>
                    <strong>Men’s sizing</strong><span>Use men’s bottoms and shoe ranges</span>
                  </button>
                  <button type="button" className={onboardingSizing === "womens" ? "selected" : ""} onClick={() => chooseOnboardingSizing("womens")}>
                    <strong>Women’s sizing</strong><span>Use women’s bottoms and shoe ranges</span>
                  </button>
                </div>
                <label className="onboarding-currency">
                  <span>Main display currency</span>
                  <select value={onboardingCurrency} onChange={(event) => setOnboardingCurrency(event.target.value)}>
                    {displayCurrencies.map((currency) => <option value={currency.code} key={currency.code}>{currency.code} — {currency.label}</option>)}
                  </select>
                  <small>Foreign prices will be converted into this currency on your saved pieces.</small>
                </label>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="onboarding-step sizes-step">
                <p className="kicker">Your defaults</p>
                <h2 id="onboarding-title">What sizes usually fit?</h2>
                <p>Select more than one if your fit changes between brands. We’ll automatically pick an available match when you import a product.</p>
                <div className="profile-groups">
                  {sizeGroupsFor(onboardingSizing).map((group) => (
                    <div className="profile-group" key={group.category}>
                      <div><strong>{group.category}</strong><small>{onboardingSizes[group.category]?.length ? onboardingSizes[group.category].join(" · ") : "Optional"}</small></div>
                      <div className="profile-options">
                        {group.options.map((size) => {
                          const selected = onboardingSizes[group.category]?.includes(size);
                          return <button type="button" key={size} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleOnboardingSize(group.category, size)}>{size}</button>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="form-message error">{error}</div>}
            <div className="dialog-actions onboarding-actions">
              {onboardingStep > 1 && <button type="button" className="secondary-button" onClick={() => { setError(""); setOnboardingStep((step) => step - 1); }} disabled={onboardingPending}>Back</button>}
              {onboardingStep < 3
                ? <button type="button" className="primary-button" onClick={continueOnboarding}>Continue</button>
                : <button type="button" className="primary-button" onClick={finishOnboarding} disabled={onboardingPending}>{onboardingPending ? "Saving…" : "Finish setup"}</button>}
            </div>
          </section>
        </div>
      )}

      {dialogOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && stage !== "importing" && stage !== "saving") closeDialog(); }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" onClick={closeDialog} disabled={stage === "importing" || stage === "saving"} aria-label="Close">×</button>
            {stage === "importing" ? (
              <div className="importing-state">
                <div className="import-loader"><span /><span /><span /></div>
                <p className="kicker">Reading the product page</p>
                <h2 id="dialog-title">Getting the details…</h2>
                <p>Looking for the image, price, sizes and availability.</p>
              </div>
            ) : (
              <form onSubmit={saveDraft}>
                <div className="dialog-header">
                  <p className="kicker">{editingId ? "Edit saved piece" : "Quick review"}</p>
                  <h2 id="dialog-title">{editingId ? "Update the details." : "Does this look right?"}</h2>
                  <p>{editingId ? "Change anything you want to keep with this piece." : "Correct anything the retailer page did not make clear."}</p>
                </div>
                {notice && <div className="form-message success">{notice}</div>}
                {error && <div className="form-message error">{error}</div>}

                {!!draft.colors?.length && (
                  <div className="color-picker">
                    <label>Choose a color</label>
                    <div className="color-options">
                      {draft.colors.map((color) => (
                        <button type="button" key={color.label} onClick={() => void chooseColor(color.label)} className={draft.selectedColor === color.label ? "selected" : ""} disabled={Boolean(colorLoading)}>
                          <span className="color-thumb">
                            {color.imageUrl ? <Image loader={sourceImageLoader} src={color.imageUrl} alt="" fill sizes="48px" unoptimized /> : color.label.slice(0, 1)}
                          </span>
                          <span>{colorLoading === color.label ? "Loading…" : color.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="review-layout">
                  <div className="preview-image">{draft.imageUrl ? <Image loader={sourceImageLoader} src={draft.imageUrl} alt="Product preview" fill sizes="220px" unoptimized /> : <span>Product image</span>}</div>
                  <div className="form-fields">
                    <label>Product link<input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value, canonicalUrl: event.target.value })} placeholder="https://…" required /></label>
                    <label>Product name<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
                    <div className="field-row">
                      <label>Retailer<input value={draft.retailer} onChange={(event) => setDraft({ ...draft, retailer: event.target.value })} required /></label>
                      <label>Brand<input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} /></label>
                    </div>
                    <div className="field-row three">
                      <label>Original price<input type="number" min="0" step="0.01" value={draft.priceCents === null ? "" : draft.priceCents / 100} onChange={(event) => setDraft({ ...draft, priceCents: event.target.value ? Math.round(Number(event.target.value) * 100) : null })} /></label>
                      <label>Retailer currency<input maxLength={3} minLength={3} required pattern="[A-Za-z]{3}" title="Use a three-letter currency code, such as CNY or JPY" value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="CNY" /></label>
                      <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
                    </div>
                    <label>Image URL<input type="url" value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} placeholder="https://…" /></label>
                  </div>
                </div>

                <div className="variant-section">
                  <div className="variant-heading">
                    <label>Size to track <span>(optional)</span></label>
                    {!!sizeProfile[draft.category]?.length && <small>Your {draft.category.toLowerCase()} sizes: {sizeProfile[draft.category].join(" + ")}</small>}
                  </div>
                  {displayedDraftSizes.length ? (
                    <div className="size-options">
                      {displayedDraftSizes.map((size) => (
                        <button type="button" key={size.label} onClick={() => chooseSize(size.label)} className={draft.selectedSize === size.label ? "selected" : ""}>
                          {size.label}<small>{size.status === "in-stock" ? "Available" : size.status === "out-of-stock" ? "Sold out" : "Unknown"}</small>
                        </button>
                      ))}
                    </div>
                  ) : <input className="size-input" value={draft.selectedSize} onChange={(event) => setDraft({ ...draft, selectedSize: event.target.value, status: "unknown" })} placeholder="Small, US 8, 30×32…" />}
                  <div className="field-row">
                    {!draft.colors?.length && <label>Color<input value={draft.selectedColor} onChange={(event) => setDraft({ ...draft, selectedColor: event.target.value })} placeholder="Optional" /></label>}
                    <label>Availability<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as StockStatus })}><option value="unknown">Unable to verify</option><option value="in-stock">In stock</option><option value="out-of-stock">Out of stock</option></select></label>
                  </div>
                </div>

                <div className="dialog-actions">
                  <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={stage === "saving"}>{stage === "saving" ? "Saving…" : editingId ? "Save changes" : "Save item"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {profileOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section className="dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <button className="dialog-close" type="button" onClick={() => setProfileOpen(false)} aria-label="Close size profile">×</button>
            <div className="dialog-header">
              <p className="kicker">Personal fit</p>
              <h2 id="profile-title">My sizes</h2>
              <p>Select every size that usually works for you. Products will automatically show whether any of those sizes are available.</p>
            </div>
            <div className="profile-sizing-switch">
              <div>
                <strong>Sizing system</strong>
                <small>Controls your bottoms and US shoe size options.</small>
              </div>
              <div className="sizing-choice compact" aria-label="Sizing system">
                <button type="button" className={profileSizing === "mens" ? "selected" : ""} aria-pressed={profileSizing === "mens"} onClick={() => chooseProfileSizing("mens")}>Men</button>
                <button type="button" className={profileSizing === "womens" ? "selected" : ""} aria-pressed={profileSizing === "womens"} onClick={() => chooseProfileSizing("womens")}>Women</button>
              </div>
            </div>
            <div className="profile-groups">
              {sizeGroupsFor(profileSizing).map((group) => (
                <div className="profile-group" key={group.category}>
                  <div>
                    <strong>{group.category}{group.category === "Shoes" && <span className="size-system-badge">{profileSizing === "mens" ? "Men’s US" : "Women’s US"}</span>}</strong>
                    <small>{profileDraft[group.category]?.length ? profileDraft[group.category].join(" · ") : "No sizes selected"}</small>
                  </div>
                  <div className="profile-options">
                    {group.options.map((size) => {
                      const selected = profileDraft[group.category]?.includes(size);
                      return <button type="button" key={size} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleProfileSize(group.category, size)}>{size}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setProfileOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" onClick={saveSizeProfile}>Save my sizes</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
