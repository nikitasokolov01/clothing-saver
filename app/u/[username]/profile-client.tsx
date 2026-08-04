"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { SocialHeader } from "../../_components/social-header";
import { SocialProductCard } from "../../_components/social-product-card";
import { normalizeCurrency } from "../../../lib/currency";
import { productFromRow, type ProductRow } from "../../../lib/product-storage";
import { followActionLabel, type FollowRelationship, type SocialProfile } from "../../../lib/social";
import { createClient, isSupabaseConfigured } from "../../../lib/supabase/client";
import type { ProductCollection, SavedProduct } from "../../../lib/types";

export function ProfileClient({ username }: { username: string }) {
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [viewer, setViewer] = useState<User | null>(null);
  const [relationship, setRelationship] = useState<FollowRelationship | null>(null);
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [preferredCurrency, setPreferredCurrency] = useState("");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [collection, setCollection] = useState<ProductCollection>("saved");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Social profiles need Supabase to be configured.");
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [{ data: authData }, profileResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("social_profiles").select("*").eq("username", username).maybeSingle(),
    ]);
    const nextProfile = profileResult.data as SocialProfile | null;
    const nextViewer = authData.user ?? null;
    setViewer(nextViewer);
    setProfile(nextProfile);
    if (profileResult.error) setError(profileResult.error.message);
    if (!nextProfile) {
      setLoading(false);
      return;
    }

    const followQuery = nextViewer && nextViewer.id !== nextProfile.user_id
      ? supabase.from("follows").select("*").eq("follower_id", nextViewer.id).eq("following_id", nextProfile.user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const currencyQuery = nextViewer
      ? supabase.from("profiles").select("preferred_currency").eq("user_id", nextViewer.id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const productQuery = supabase.from("products").select("*")
      .eq("user_id", nextProfile.user_id).order("created_at", { ascending: false });
    const [followResult, productResult, currencyResult] = await Promise.all([followQuery, productQuery, currencyQuery]);
    setRelationship(followResult.data as FollowRelationship | null);
    if (followResult.error) setError(followResult.error.message);
    if (productResult.error) setError(productResult.error.message);
    const nextProducts = productResult.error ? [] : (productResult.data as ProductRow[]).map(productFromRow);
    if (!productResult.error) setProducts(nextProducts);

    const currencyRow = currencyResult.data as { preferred_currency?: string | null } | null;
    const nextPreferredCurrency = normalizeCurrency(currencyRow?.preferred_currency ?? "", "");
    setPreferredCurrency(nextPreferredCurrency);
    setExchangeRates({});
    setLoading(false);
    const sourceCurrencies = [...new Set(nextProducts
      .map((product) => normalizeCurrency(product.currency, ""))
      .filter((currency) => currency && currency !== nextPreferredCurrency))];
    if (nextPreferredCurrency && sourceCurrencies.length) {
      try {
        const response = await fetch("/api/exchange-rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: sourceCurrencies, to: nextPreferredCurrency }),
        });
        if (response.ok) {
          const result = await response.json() as { rates?: Record<string, number> };
          if (result.rates) setExchangeRates(result.rates);
        }
      } catch {
        // The original retailer price remains visible if conversion is unavailable.
      }
    }
  }, [username]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProfile(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  const isOwner = Boolean(viewer && profile && viewer.id === profile.user_id);
  const canView = Boolean(profile && (isOwner || !profile.is_private || relationship?.status === "accepted"));
  const availableCollections = profile
    ? ([profile.share_saved && "saved", profile.share_closet && "closet"].filter(Boolean) as ProductCollection[])
    : [];
  const displayedCollection = isOwner || availableCollections.includes(collection) ? collection : availableCollections[0] ?? "saved";
  const visibleProducts = useMemo(() => products.filter((product) => product.collection === displayedCollection), [displayedCollection, products]);

  async function toggleFollow() {
    if (!profile || !isSupabaseConfigured) return;
    if (!viewer) {
      setError("Log in from the wardrobe page before following someone.");
      return;
    }
    setPending(true);
    setError("");
    const supabase = createClient();
    if (relationship) {
      const { error: removeError } = await supabase.from("follows").delete()
        .eq("follower_id", viewer.id).eq("following_id", profile.user_id);
      if (removeError) setError(removeError.message);
      else {
        setProfile({ ...profile, follower_count: Math.max(0, profile.follower_count - (relationship.status === "accepted" ? 1 : 0)) });
        setRelationship(null);
        setProducts(profile.is_private ? [] : products);
      }
    } else {
      const { data, error: followError } = await supabase.from("follows")
        .insert({ follower_id: viewer.id, following_id: profile.user_id }).select("*").single();
      if (followError) setError(followError.message);
      else {
        const next = data as FollowRelationship;
        setRelationship(next);
        if (next.status === "accepted") {
          setProfile({ ...profile, follower_count: profile.follower_count + 1 });
          await loadProfile();
        }
      }
    }
    setPending(false);
  }

  async function saveSettings() {
    if (!profile || !isOwner || !isSupabaseConfigured) return;
    setSettingsPending(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.from("social_profiles").update({
      bio: profile.bio.trim(),
      is_private: profile.is_private,
      share_saved: profile.share_saved,
      share_closet: profile.share_closet,
      updated_at: new Date().toISOString(),
    }).eq("user_id", profile.user_id);
    setSettingsPending(false);
    if (updateError) setError(updateError.message);
    else setMessage("Profile visibility saved.");
  }

  async function shareProfile() {
    const shareData = { title: profile?.full_name || `@${username}`, text: `See @${username}'s wardrobe`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setMessage("Profile link copied.");
      }
    } catch {
      // Closing the native share sheet is not an error the user needs to see.
    }
  }

  return (
    <main className="social-shell">
      <Suspense fallback={<div className="social-header" />}><SocialHeader /></Suspense>
      {loading ? <div className="social-loading">Loading profile…</div> : !profile ? (
        <section className="social-empty"><span>404</span><h1>Profile not found.</h1><p>That username may have changed.</p></section>
      ) : (
        <>
          <section className="profile-hero">
            <div className="profile-avatar">{profile.full_name.slice(0, 1).toUpperCase() || profile.username.slice(0, 1).toUpperCase()}</div>
            <div className="profile-identity">
              <p className="kicker">{profile.is_private ? "Private profile" : "Public profile"}</p>
              <h1>{profile.full_name || `@${profile.username}`}</h1>
              <p className="profile-handle">@{profile.username}</p>
              {profile.bio && <p className="profile-bio">{profile.bio}</p>}
              <div className="profile-counts"><span><strong>{profile.follower_count}</strong> followers</span><span><strong>{profile.following_count}</strong> following</span></div>
            </div>
            <div className="profile-actions">
              {isOwner && <Link className="primary-button" href="/profile">Manage saved pieces</Link>}
              {!isOwner && <button className={relationship ? "secondary-button" : "primary-button"} type="button" disabled={pending} onClick={toggleFollow}>{pending ? "Please wait…" : followActionLabel(relationship?.status ?? null, profile.is_private)}</button>}
              <button className="secondary-button" type="button" onClick={shareProfile}>Share profile</button>
            </div>
          </section>

          {message && <div className="toast success" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss">×</button></div>}
          {error && <div className="toast error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

          {isOwner && (
            <section className="social-settings">
              <div><p className="kicker">Profile controls</p><h2>Choose what people can see.</h2><p>Private profiles require approval before anyone can see shared collections.</p></div>
              <div className="social-settings-fields">
                <label>Bio<textarea maxLength={240} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} placeholder="A few words about your style" /></label>
                <label className="social-toggle"><span><strong>Private profile</strong><small>New followers must send a request.</small></span><input type="checkbox" checked={profile.is_private} onChange={(event) => setProfile({ ...profile, is_private: event.target.checked })} /></label>
                <label className="social-toggle"><span><strong>Share saved pieces</strong><small>Show your wishlist to allowed viewers.</small></span><input type="checkbox" checked={profile.share_saved} onChange={(event) => setProfile({ ...profile, share_saved: event.target.checked })} /></label>
                <label className="social-toggle"><span><strong>Share closet</strong><small>Show pieces you have marked as bought.</small></span><input type="checkbox" checked={profile.share_closet} onChange={(event) => setProfile({ ...profile, share_closet: event.target.checked })} /></label>
                <button className="primary-button" type="button" disabled={settingsPending} onClick={saveSettings}>{settingsPending ? "Saving…" : "Save profile"}</button>
              </div>
            </section>
          )}

          {!canView ? (
            <section className="private-profile"><span>⌁</span><h2>This wardrobe is private.</h2><p>{relationship?.status === "pending" ? "Your request is waiting for approval." : "Follow this account to see its shared pieces."}</p></section>
          ) : !availableCollections.length && !isOwner ? (
            <section className="social-empty"><span>Empty</span><h2>No shared collections.</h2><p>This person has not shared Saved or Closet yet.</p></section>
          ) : (
            <section className="profile-collection">
              <div className="collection-tabs">
                {(isOwner || profile.share_saved) && <button type="button" className={displayedCollection === "saved" ? "active" : ""} onClick={() => setCollection("saved")}>Saved <span>{products.filter((item) => item.collection === "saved").length}</span></button>}
                {(isOwner || profile.share_closet) && <button type="button" className={displayedCollection === "closet" ? "active" : ""} onClick={() => setCollection("closet")}>Closet <span>{products.filter((item) => item.collection === "closet").length}</span></button>}
              </div>
              {visibleProducts.length ? <div className="social-product-grid">{visibleProducts.map((product) => <SocialProductCard product={product} preferredCurrency={preferredCurrency} exchangeRates={exchangeRates} key={product.id} />)}</div> : (
                <div className="social-empty"><span>Nothing here</span><h2>No {displayedCollection} pieces yet.</h2></div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
