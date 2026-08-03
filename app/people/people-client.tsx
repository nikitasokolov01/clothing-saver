"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SocialHeader } from "../_components/social-header";
import type { SocialProfile } from "../../lib/social";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";

export function PeopleClient() {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState(isSupabaseConfigured ? "" : "People search needs Supabase to be configured.");

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let active = true;
    const load = async () => {
      const [{ data: authData }, profileResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("social_profiles").select("*").order("follower_count", { ascending: false }).limit(60),
      ]);
      if (!active) return;
      setViewerId(authData.user?.id ?? "");
      if (profileResult.error) setError(profileResult.error.message);
      else setProfiles(profileResult.data as SocialProfile[]);
      setLoading(false);
    };
    void load();

    return () => { active = false; };
  }, []);

  const visibleProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return profiles.filter((profile) => profile.user_id !== viewerId && (!normalized
      || profile.username.toLowerCase().includes(normalized)
      || profile.full_name.toLowerCase().includes(normalized)));
  }, [profiles, query, viewerId]);

  return (
    <main className="social-shell">
      <SocialHeader />
      <section className="social-page-heading people-heading">
        <p className="kicker">Discover</p>
        <h1>Find your people.</h1>
        <p>Search by name or username, open a profile, and follow the styles you want in your home feed.</p>
        <label className="people-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search people</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or @usernames" />
        </label>
      </section>
      {error && <div className="toast error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
      {loading ? <div className="social-loading">Finding people…</div> : visibleProfiles.length ? (
        <section className="people-grid" aria-label="People on Saved">
          {visibleProfiles.map((profile) => (
            <article className="person-card" key={profile.user_id}>
              <div className="person-avatar">{profile.full_name.slice(0, 1).toUpperCase() || profile.username.slice(0, 1).toUpperCase()}</div>
              <div className="person-copy">
                <h2>{profile.full_name || `@${profile.username}`}</h2>
                <p>@{profile.username}</p>
                {profile.bio && <small>{profile.bio}</small>}
                <span>{profile.follower_count} {profile.follower_count === 1 ? "follower" : "followers"}{profile.is_private ? " · Private" : ""}</span>
              </div>
              <Link className="secondary-button" href={`/u/${profile.username}`}>View profile</Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="social-empty"><span>No results</span><h2>No one matched that search.</h2><p>Try a name or username without the @ symbol.</p></section>
      )}
    </main>
  );
}
