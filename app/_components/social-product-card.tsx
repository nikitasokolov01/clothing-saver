"use client";

import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { SocialProfile } from "../../lib/social";
import type { SavedProduct } from "../../lib/types";

const sourceImageLoader = ({ src }: ImageLoaderProps) => src;

function money(cents: number | null, currency: string) {
  if (cents === null) return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export function SocialProductCard({ product, owner }: { product: SavedProduct; owner?: SocialProfile }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="social-product-card">
      <a className="social-product-link" href={product.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${product.title}`} />
      <div className="social-product-image">
        {product.imageUrl && !imageFailed ? (
          <Image loader={sourceImageLoader} src={product.imageUrl} alt={product.title} fill sizes="(max-width: 700px) 45vw, 280px" unoptimized onError={() => setImageFailed(true)} />
        ) : <span>{product.category.slice(0, 1)}</span>}
      </div>
      <div className="social-product-copy">
        {owner && (
          <Link className="social-owner" href={`/u/${owner.username}`}>
            <span>{owner.full_name.slice(0, 1).toUpperCase() || owner.username.slice(0, 1).toUpperCase()}</span>
            <div><strong>{owner.full_name || `@${owner.username}`}</strong><small>@{owner.username}</small></div>
          </Link>
        )}
        <p className="kicker">{product.collection === "closet" ? "Added to closet" : "Saved"} {relativeDate(product.purchasedAt ?? product.createdAt)}</p>
        <h2>{product.title}</h2>
        <p>{product.brand || product.retailer} · {money(product.priceCents, product.currency)}</p>
        <div className="social-card-tags">
          <span>{product.category}</span>
          {product.selectedColor && <span>{product.selectedColor}</span>}
          <span>{product.collection === "closet" ? "In closet" : "Saved piece"}</span>
        </div>
      </div>
      <span className="social-product-arrow" aria-hidden="true">↗</span>
    </article>
  );
}
