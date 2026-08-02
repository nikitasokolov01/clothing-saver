"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ProductDraft, SavedProduct, StockStatus } from "../lib/types";

const categories = ["All", "Tops", "Bottoms", "Shoes", "Outerwear", "Accessories", "Underwear", "Other"];

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
  const prefix = size ? `${size} ` : "";
  if (status === "in-stock") return `${prefix}in stock`;
  if (status === "out-of-stock") return `${prefix}out of stock`;
  return size ? `${size} not verified` : "Availability unknown";
}

function ProductImage({ product }: { product: Pick<SavedProduct, "imageUrl" | "title" | "category"> }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) {
    return (
      <div className="product-placeholder" aria-label={`No image available for ${product.title}`}>
        <span>{product.category.slice(0, 1)}</span>
        <small>IMAGE UNAVAILABLE</small>
      </div>
    );
  }
  return <img src={product.imageUrl} alt={product.title} onError={() => setFailed(true)} />;
}

export function WardrobeApp() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "importing" | "review" | "saving">("idle");
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your list.");
        setProducts(data.products);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load your list."))
      .finally(() => setLoading(false));
  }, []);

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
      const categoryMatches = filter === "All" || product.category === filter;
      const textMatches = !needle || `${product.title} ${product.brand} ${product.retailer} ${product.selectedColor}`.toLowerCase().includes(needle);
      return categoryMatches && textMatches;
    });
  }, [filter, products, query]);

  const inStockCount = products.filter((product) => product.status === "in-stock").length;
  const waitingCount = products.filter((product) => product.status === "out-of-stock").length;

  async function beginImport(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
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
        setNotice(product.sizes.length ? "Product details found. Choose the size you want." : "Product details found. Size availability was not published on the page.");
      }
    } catch {
      setDraft(emptyDraft(url));
      setError("The page could not be reached. Add the details manually below.");
    } finally {
      setStage("review");
    }
  }

  function chooseSize(size: string) {
    const matching = draft.sizes.find((option) => option.label === size);
    setDraft({ ...draft, selectedSize: size, status: matching?.status ?? "unknown" });
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.retailer.trim()) {
      setError("Add a product name and retailer before saving.");
      return;
    }
    setStage("saving");
    setError("");
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The item could not be saved.");
      setProducts((current) => [data.product, ...current.filter((product) => product.canonicalUrl !== data.product.canonicalUrl)]);
      setNotice(`${data.product.title} was added to your list.`);
      setUrl("");
      closeDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The item could not be saved.");
      setStage("review");
    }
  }

  async function removeProduct(product: SavedProduct) {
    if (!window.confirm(`Remove “${product.title}” from your list?`)) return;
    const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
    if (response.ok) {
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setNotice(`${product.title} was removed.`);
    } else {
      setError("That item could not be removed.");
    }
  }

  async function refreshProduct(product: SavedProduct) {
    setRefreshingId(product.id);
    setError("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/refresh`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Availability could not be checked.");
      setProducts((current) => current.map((item) => item.id === product.id ? data.product : item));
      setNotice(`Checked ${product.title}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Availability could not be checked.");
    } finally {
      setRefreshingId("");
    }
  }

  function openManual() {
    setDraft(emptyDraft(url));
    setError("");
    setNotice("Add anything the retailer didn't publish.");
    setDialogOpen(true);
    setStage("review");
  }

  function closeDialog() {
    setDialogOpen(false);
    setStage("idle");
    setDraft(emptyDraft());
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="The List home">
          <span className="wordmark-mark">L</span>
          <span>THE LIST</span>
        </a>
        <div className="header-meta">
          <span className="sync-dot" />
          SAVED LOCALLY
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">A considered wardrobe starts here</div>
        <h1>Things worth<br /><em>coming back to.</em></h1>
        <p>Paste any clothing link. We’ll pull in the details and keep the size you want in view.</p>

        <form className="import-bar" onSubmit={beginImport}>
          <span className="link-glyph" aria-hidden="true">↗</span>
          <label className="sr-only" htmlFor="product-url">Product link</label>
          <input
            id="product-url"
            type="url"
            placeholder="Paste a product link…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
          <button type="submit">Save item <span aria-hidden="true">→</span></button>
        </form>
        <button className="manual-link" type="button" onClick={openManual}>or add the details manually</button>
      </section>

      <section className="collection" aria-labelledby="collection-title">
        <div className="collection-heading">
          <div>
            <span className="section-number">01</span>
            <h2 id="collection-title">Your saved pieces</h2>
          </div>
          <div className="collection-stats" aria-label="Collection summary">
            <span><strong>{products.length}</strong> saved</span>
            <span><strong>{inStockCount}</strong> ready</span>
            <span><strong>{waitingCount}</strong> waiting</span>
          </div>
        </div>

        <div className="toolbar">
          <div className="filters" aria-label="Filter by category">
            {categories.map((category) => (
              <button
                type="button"
                className={filter === category ? "active" : ""}
                aria-pressed={filter === category}
                onClick={() => setFilter(category)}
                key={category}
              >
                {category}
              </button>
            ))}
          </div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search saved products</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your list" />
          </label>
        </div>

        {notice && <div className="toast success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
        {error && !dialogOpen && <div className="toast error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

        {loading ? (
          <div className="loading-grid" aria-label="Loading saved products">
            {[0, 1, 2].map((number) => <div className="loading-card" key={number} />)}
          </div>
        ) : visibleProducts.length ? (
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article className="product-card" key={product.id} style={{ "--delay": `${index * 55}ms` } as React.CSSProperties}>
                <div className="product-image">
                  <ProductImage product={product} />
                  <span className={`status-badge ${product.status}`}>{statusCopy(product.status, product.selectedSize)}</span>
                  <button className="remove-button" type="button" onClick={() => removeProduct(product)}>Remove</button>
                </div>
                <div className="product-info">
                  <div className="product-brand">{product.brand || product.retailer}</div>
                  <h3>{product.title}</h3>
                  <div className="product-details">
                    <span>{formatMoney(product.priceCents, product.currency)}</span>
                    {product.selectedColor && <span>{product.selectedColor}</span>}
                  </div>
                  <div className="product-footer">
                    <button
                      type="button"
                      className="check-button"
                      onClick={() => refreshProduct(product)}
                      disabled={refreshingId === product.id || product.url.includes("example.com")}
                    >
                      <span className={refreshingId === product.id ? "spinning" : ""}>↻</span>
                      {refreshingId === product.id ? "Checking…" : `Checked ${timeAgo(product.checkedAt)}`}
                    </button>
                    <a href={product.url} target="_blank" rel="noreferrer" aria-label={`View ${product.title} at ${product.retailer}`}>View ↗</a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span>Nothing here yet</span>
            <h3>{query || filter !== "All" ? "Try another filter." : "Save the first piece on your mind."}</h3>
            <button type="button" onClick={() => { setFilter("All"); setQuery(""); document.getElementById("product-url")?.focus(); }}>Start a list →</button>
          </div>
        )}
      </section>

      <footer>
        <span>THE LIST / MVP 01</span>
        <p>Save thoughtfully. Buy when it’s right.</p>
      </footer>

      {dialogOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && stage !== "importing" && stage !== "saving") closeDialog(); }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" onClick={closeDialog} disabled={stage === "importing" || stage === "saving"} aria-label="Close">×</button>
            {stage === "importing" ? (
              <div className="importing-state">
                <div className="import-loader"><span /><span /><span /></div>
                <div className="eyebrow">Reading the product page</div>
                <h2 id="dialog-title">Gathering the details.</h2>
                <p>Looking for the image, price, sizes, and availability.</p>
              </div>
            ) : (
              <form onSubmit={saveDraft}>
                <div className="dialog-header">
                  <div className="eyebrow">Review before saving</div>
                  <h2 id="dialog-title">Is everything right?</h2>
                  <p>Retailers publish product information differently. Correct anything we missed.</p>
                </div>
                {notice && <div className="form-message success">{notice}</div>}
                {error && <div className="form-message error">{error}</div>}

                <div className="review-layout">
                  <div className="preview-image">
                    {draft.imageUrl ? <img src={draft.imageUrl} alt="Product preview" /> : <span>Paste an image URL below</span>}
                  </div>
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
                  <label>Size you want</label>
                  {draft.sizes.length ? (
                    <div className="size-options">
                      {draft.sizes.map((size) => (
                        <button type="button" key={size.label} onClick={() => chooseSize(size.label)} className={draft.selectedSize === size.label ? "selected" : ""}>
                          {size.label}<small>{size.status === "in-stock" ? "Available" : size.status === "out-of-stock" ? "Sold out" : "Unknown"}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input className="size-input" value={draft.selectedSize} onChange={(event) => setDraft({ ...draft, selectedSize: event.target.value, status: "unknown" })} placeholder="e.g. Small, US 8, 30×32" />
                  )}
                  <div className="field-row">
                    <label>Color<input value={draft.selectedColor} onChange={(event) => setDraft({ ...draft, selectedColor: event.target.value })} placeholder="Optional" /></label>
                    <label>Current availability<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as StockStatus })}><option value="unknown">Unable to verify</option><option value="in-stock">In stock</option><option value="out-of-stock">Out of stock</option></select></label>
                  </div>
                </div>

                <div className="dialog-actions">
                  <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={stage === "saving"}>{stage === "saving" ? "Saving…" : "Add to my list →"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
