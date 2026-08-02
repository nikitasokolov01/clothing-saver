"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import Image, { type ImageLoaderProps } from "next/image";
import type { User } from "@supabase/supabase-js";
import { productFromRow, productToRow, type ProductRow } from "../lib/product-storage";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import type { ProductDraft, SavedProduct, StockStatus } from "../lib/types";

const categories = ["All", "Tops", "Bottoms", "Shoes", "Outerwear", "Accessories", "Underwear", "Other"];
const storageKey = "clothing-saver:products:v1";
const sizeProfileKey = "clothing-saver:size-profile:v1";
const sourceImageLoader = ({ src }: ImageLoaderProps) => src;

type SizeProfile = Record<string, string[]>;

const sizeGroups: Array<{ category: string; options: string[] }> = [
  { category: "Tops", options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
  { category: "Outerwear", options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
  { category: "Bottoms", options: ["26", "28", "30", "32", "34", "36", "38", "40"] },
  { category: "Shoes", options: ["US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12", "US 13"] },
  { category: "Underwear", options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
];

const defaultSizeProfile: SizeProfile = {
  Tops: ["S", "M"],
  Outerwear: [],
  Bottoms: [],
  Shoes: [],
  Underwear: [],
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
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
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

function normalizeSize(size: string) {
  const compact = size.trim().toUpperCase().replace(/[._-]/g, " ").replace(/\s+/g, " ");
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState("");
  const [sizeProfile, setSizeProfile] = useState<SizeProfile>(defaultSizeProfile);
  const [profileDraft, setProfileDraft] = useState<SizeProfile>(defaultSizeProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
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
          supabase.from("profiles").select("size_profile").eq("user_id", account.id).maybeSingle(),
        ]);
        if (!active) return;
        if (productsResult.error) setError(productsResult.error.message);
        else setProducts((productsResult.data as ProductRow[]).map(productFromRow));
        if (profileResult.error) setError(profileResult.error.message);
        else if (profileResult.data?.size_profile) setSizeProfile(profileResult.data.size_profile as SizeProfile);
        setLoading(false);
      };
      const initialize = async () => {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError) setError(authError.message);
        setUser(data.user);
        if (data.user) await loadAccount(data.user);
        else {
          setProducts([]);
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
    setProfileOpen(true);
  }

  function toggleProfileSize(category: string, size: string) {
    const current = profileDraft[category] ?? [];
    const next = current.includes(size) ? current.filter((item) => item !== size) : [...current, size];
    setProfileDraft({ ...profileDraft, [category]: next });
  }

  async function saveSizeProfile() {
    setSizeProfile(profileDraft);
    if (supabase && user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        user_id: user.id,
        size_profile: profileDraft,
        updated_at: new Date().toISOString(),
      });
      if (profileError) {
        setError(profileError.message);
        return;
      }
      setNotice("Your size profile was saved to your account.");
    } else try {
      window.localStorage.setItem(sizeProfileKey, JSON.stringify(profileDraft));
      setNotice("Your size profile was saved.");
    } catch {
      setError("Your size profile could not be saved in this browser.");
    }
    setProfileOpen(false);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthPending(true);
    setError("");
    const result = authMode === "login"
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({ email: authEmail, password: authPassword });
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
        if (product.sizes.length === 1) {
          product.selectedSize = product.sizes[0].label;
          product.status = product.sizes[0].status;
        }
        setDraft(product);
        const preferred = new Set((sizeProfile[product.category] ?? []).map(normalizeSize));
        const availableMatches = product.sizes
          .filter((size) => preferred.has(normalizeSize(size.label)) && size.status === "in-stock")
          .map((size) => size.label);
        setNotice(availableMatches.length
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

  function chooseColor(colorLabel: string) {
    const color = draft.colors?.find((option) => option.label === colorLabel);
    if (!color) return;
    const matchingSize = color.sizes.find((option) => option.label === draft.selectedSize);
    setDraft({
      ...draft,
      url: matchingSize?.url || color.url || withVariant(draft.url, matchingSize?.variantId ?? color.variantId),
      imageUrl: color.imageUrl || draft.imageUrl,
      selectedColor: color.label,
      sizes: color.sizes,
      status: draft.selectedSize ? matchingSize?.status ?? "unknown" : "unknown",
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
    const existing = products.find((product) => product.canonicalUrl === draft.canonicalUrl || product.url === draft.url);
    const product: SavedProduct = {
      ...draft,
      id: existing?.id ?? crypto.randomUUID(),
      collection: existing?.collection ?? "saved",
      purchasedAt: existing?.purchasedAt ?? null,
      checkedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    if (supabase && user) {
      const { data, error: saveError } = await supabase
        .from("products")
        .upsert(productToRow(product, user.id), { onConflict: "user_id,canonical_url" })
        .select()
        .single();
      if (saveError) {
        setError(saveError.message);
        setStage("review");
        return;
      }
      const saved = productFromRow(data as ProductRow);
      setProducts([saved, ...products.filter((item) => item.id !== saved.id && item.canonicalUrl !== saved.canonicalUrl)]);
    } else {
      commitLocalProducts([product, ...products.filter((item) => item.id !== product.id)]);
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

  function closeDialog() {
    setDialogOpen(false);
    setStage("idle");
    setDraft(emptyDraft());
    setError("");
    setNotice("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Saved wardrobe home">
          <span className="brand-mark">s</span>
          <span>Saved</span>
        </a>
        <div className="topbar-actions">
          <button className="profile-button" type="button" onClick={openSizeProfile}>My sizes</button>
          {supabase ? (
            <button className="account-button" type="button" onClick={() => setAuthOpen(true)}>
              <span className="account-avatar">{user?.email?.slice(0, 1).toUpperCase() || "?"}</span>
              <span>{user?.email || "Log in"}</span>
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
                  <p className="price">{formatMoney(product.priceCents, product.currency)}</p>
                  <div className="pill-tags">
                    <span className={`stock-tag ${availability.status}`}>{availability.label}</span>
                    {product.selectedColor && <span className="soft-tag">{product.selectedColor}</span>}
                  </div>
                  <div className="card-meta">
                    <button type="button" onClick={() => refreshProduct(product)} disabled={refreshingId === product.id} aria-label={`Refresh ${product.title}`}>
                      <span className={refreshingId === product.id ? "spinning" : ""}>↻</span> {refreshingId === product.id ? "Checking" : `Checked ${timeAgo(product.checkedAt)}`}
                    </button>
                    <div className="card-actions">
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
        <span>{supabase ? user ? `Synced to ${user.email}` : "Log in to sync your collection" : "Local preview mode"}</span>
        <span>{supabase ? "Protected per account with Supabase" : "Add Supabase keys to enable accounts"}</span>
      </footer>

      {authOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !authPending) setAuthOpen(false); }}>
          <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="dialog-close" type="button" onClick={() => setAuthOpen(false)} disabled={authPending} aria-label="Close account dialog">×</button>
            {user ? (
              <div className="account-panel">
                <span className="account-large-avatar">{user.email?.slice(0, 1).toUpperCase()}</span>
                <p className="kicker">Your account</p>
                <h2 id="auth-title">You’re logged in.</h2>
                <p>{user.email}</p>
                <div className="account-stats">
                  <span><strong>{products.filter((product) => product.collection === "saved").length}</strong> saved</span>
                  <span><strong>{products.filter((product) => product.collection === "closet").length}</strong> in closet</span>
                </div>
                <button className="secondary-button" type="button" onClick={signOut}>Log out</button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={submitAuth}>
                <p className="kicker">Private by default</p>
                <h2 id="auth-title">{authMode === "login" ? "Welcome back." : "Create your account."}</h2>
                <p>Your saved pieces, sizes and closet will follow you between devices.</p>
                {notice && <div className="form-message success">{notice}</div>}
                {error && <div className="form-message error">{error}</div>}
                <label>Email<input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label>
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
                  <p className="kicker">Quick review</p>
                  <h2 id="dialog-title">Does this look right?</h2>
                  <p>Correct anything the retailer page did not make clear.</p>
                </div>
                {notice && <div className="form-message success">{notice}</div>}
                {error && <div className="form-message error">{error}</div>}

                {!!draft.colors?.length && (
                  <div className="color-picker">
                    <label>Choose a color</label>
                    <div className="color-options">
                      {draft.colors.map((color) => (
                        <button type="button" key={color.label} onClick={() => chooseColor(color.label)} className={draft.selectedColor === color.label ? "selected" : ""}>
                          <span className="color-thumb">
                            {color.imageUrl ? <Image loader={sourceImageLoader} src={color.imageUrl} alt="" fill sizes="48px" unoptimized /> : color.label.slice(0, 1)}
                          </span>
                          <span>{color.label}</span>
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
                      <label>Price<input type="number" min="0" step="0.01" value={draft.priceCents === null ? "" : draft.priceCents / 100} onChange={(event) => setDraft({ ...draft, priceCents: event.target.value ? Math.round(Number(event.target.value) * 100) : null })} /></label>
                      <label>Currency<input maxLength={3} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} /></label>
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
                  {draft.sizes.length ? (
                    <div className="size-options">
                      {draft.sizes.map((size) => (
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
                  <button type="submit" className="primary-button" disabled={stage === "saving"}>{stage === "saving" ? "Saving…" : "Save item"}</button>
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
            <div className="profile-groups">
              {sizeGroups.map((group) => (
                <div className="profile-group" key={group.category}>
                  <div>
                    <strong>{group.category}</strong>
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
