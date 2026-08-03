"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";

export function SocialHeader() {
  const pathname = usePathname();
  const [username, setUsername] = useState("");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    let active = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      const [profileResult, notificationResult] = await Promise.all([
        supabase.from("social_profiles").select("username").eq("user_id", data.user.id).maybeSingle(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      if (!active) return;
      setUsername(profileResult.data?.username ?? "");
      setUnread(notificationResult.count ?? 0);
    });

    return () => { active = false; };
  }, []);

  return (
    <header className="social-header">
      <Link className="brand" href="/" aria-label="Saved wardrobe home">
        <span className="brand-mark">s</span>
        <span>Saved</span>
      </Link>
      <nav className="social-nav" aria-label="Social navigation">
        <Link className={pathname === "/" ? "active" : ""} href="/">Wardrobe</Link>
        <Link className={pathname === "/feed" ? "active" : ""} href="/feed">Feed</Link>
        <Link className={pathname === "/notifications" ? "active" : ""} href="/notifications">
          Inbox {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
        </Link>
        {username && <Link className={pathname === `/u/${username}` ? "active" : ""} href={`/u/${username}`}>@{username}</Link>}
      </nav>
    </header>
  );
}
