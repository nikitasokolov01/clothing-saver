"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SocialHeader } from "../_components/social-header";
import { SocialProductCard } from "../_components/social-product-card";
import { productFromRow, type ProductRow } from "../../lib/product-storage";
import type { SocialProfile } from "../../lib/social";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";
import type { SavedProduct } from "../../lib/types";

type FeedItem = { product: SavedProduct; owner: SocialProfile };

export function FeedClient() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!isSupabaseConfigured) {
        if (active) {
          setError("The social feed needs Supabase to be configured.");
          setLoading(false);
        }
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const user = data.user;
      setSignedIn(Boolean(user));
      if (!user) {
        setLoading(false);
        return;
      }

      const followResult = await supabase.from("follows").select("following_id")
        .eq("follower_id", user.id).eq("status", "accepted");
      if (!active) return;
      if (followResult.error) {
        setError(followResult.error.message);
        setLoading(false);
        return;
      }
      const followingIds = followResult.data.map((row) => row.following_id);
      setFollowingCount(followingIds.length);
      if (!followingIds.length) {
        setLoading(false);
        return;
      }

      const [profileResult, productResult] = await Promise.all([
        supabase.from("social_profiles").select("*").in("user_id", followingIds),
        supabase.from("products").select("*").in("user_id", followingIds).order("updated_at", { ascending: false }).limit(100),
      ]);
      if (!active) return;
      if (profileResult.error || productResult.error) {
        setError(profileResult.error?.message ?? productResult.error?.message ?? "The feed could not load.");
      } else {
        const profiles = new Map((profileResult.data as SocialProfile[]).map((profile) => [profile.user_id, profile]));
        setItems((productResult.data as ProductRow[]).flatMap((row) => {
          const owner = profiles.get(row.user_id);
          return owner ? [{ product: productFromRow(row), owner }] : [];
        }));
      }
      setLoading(false);
    };
    const timer = window.setTimeout(() => void load(), 0);

    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  return (
    <main className="social-shell">
      <SocialHeader />
      <section className="social-page-heading">
        <p className="kicker">Following</p>
        <h1>Your style feed.</h1>
        <p>New saves and closet additions from people you follow.</p>
      </section>
      {error && <div className="toast error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
      {loading ? <div className="social-loading">Loading your feed…</div> : !signedIn ? (
        <section className="social-empty"><span>Members only</span><h2>Log in to build your feed.</h2><p>Return to your wardrobe to log in or create an account.</p><Link className="primary-button" href="/">Go to wardrobe</Link></section>
      ) : !followingCount ? (
        <section className="social-empty"><span>Start following</span><h2>Your feed is ready for people.</h2><p>Open someone’s shared profile link and follow them to see their pieces here.</p></section>
      ) : items.length ? (
        <div className="feed-list">{items.map(({ product, owner }) => <SocialProductCard product={product} owner={owner} key={product.id} />)}</div>
      ) : (
        <section className="social-empty"><span>Caught up</span><h2>No shared pieces yet.</h2><p>The people you follow have not shared anything with the feed.</p></section>
      )}
    </main>
  );
}
