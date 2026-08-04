"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";

export function SocialNavigation() {
  const pathname = usePathname();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    let active = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      const [profileResult, notificationResult] = await Promise.all([
        supabase.from("social_profiles").select("username,full_name").eq("user_id", data.user.id).maybeSingle(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", data.user.id).is("read_at", null),
      ]);
      if (!active) return;
      setUsername(profileResult.data?.username ?? "");
      setDisplayName(profileResult.data?.full_name ?? "");
      setUnread(notificationResult.count ?? 0);
    });

    return () => { active = false; };
  }, []);

  return (
    <nav className="social-nav" aria-label="Social navigation">
      <Link className={pathname === "/feed" ? "active" : ""} href="/feed" aria-current={pathname === "/feed" ? "page" : undefined}>
        <span className="nav-icon" aria-hidden="true">⌂</span><span className="nav-label">Home</span>
      </Link>
      <Link className={pathname === "/people" ? "active" : ""} href="/people" aria-current={pathname === "/people" ? "page" : undefined}>
        <span className="nav-icon" aria-hidden="true">⌕</span><span className="nav-label">People</span>
      </Link>
      <Link className="nav-add" href="/profile?add=1">
        <span className="nav-icon" aria-hidden="true">＋</span><span className="nav-label">Add</span>
      </Link>
      <Link className={pathname === "/notifications" ? "active" : ""} href="/notifications" aria-current={pathname === "/notifications" ? "page" : undefined}>
        <span className="nav-icon" aria-hidden="true">♡</span><span className="nav-label">Inbox</span>{unread > 0 && <span className="nav-count">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <Link className={pathname === "/profile" || pathname === `/u/${username}` ? "active" : ""} href="/profile" aria-current={pathname === "/profile" ? "page" : undefined}>
        <span className="nav-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase() || username.slice(0, 1).toUpperCase() || "S"}</span><span className="nav-label">Profile</span>
      </Link>
    </nav>
  );
}

export function SocialHeader() {
  return (
    <header className="social-header">
      <Link className="brand" href="/feed" aria-label="Saved home feed">
        <span className="brand-mark">s</span>
        <span>Saved</span>
      </Link>
      <SocialNavigation />
    </header>
  );
}
