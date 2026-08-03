"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SocialHeader } from "../_components/social-header";
import {
  notificationActor,
  notificationMessage,
  notificationProduct,
  type SocialNotification,
} from "../../lib/social";
import { createClient, isSupabaseConfigured } from "../../lib/supabase/client";

function notificationTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function notificationPrice(cents: number | null, currency: string | null) {
  if (cents === null) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || ""}`.trim();
  }
}

export function NotificationsClient() {
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  async function loadNotifications() {
    if (!isSupabaseConfigured) {
      setError("Notifications need Supabase to be configured.");
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setLoading(false);
      return;
    }
    setUserId(authData.user.id);
    const result = await supabase.from("notifications")
      .select("*,actor:social_profiles!notifications_actor_id_fkey(*),product:products!notifications_product_id_fkey(id,title,url,image_url,price_cents,original_price_cents,currency)")
      .order("created_at", { ascending: false }).limit(100);
    if (result.error) setError(result.error.message);
    else setNotifications(result.data as unknown as SocialNotification[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function respond(notification: SocialNotification, accept: boolean) {
    const actor = notificationActor(notification);
    if (!actor || !userId || !isSupabaseConfigured) return;
    setPendingId(notification.id);
    setError("");
    const supabase = createClient();
    const relationshipResult = accept
      ? await supabase.from("follows").update({ status: "accepted" })
        .eq("follower_id", actor.user_id).eq("following_id", userId).eq("status", "pending")
      : await supabase.from("follows").delete()
        .eq("follower_id", actor.user_id).eq("following_id", userId).eq("status", "pending");
    const relationshipError = relationshipResult.error;
    if (relationshipError) {
      setError(relationshipError.message);
    } else {
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
    }
    setPendingId("");
  }

  async function markAllRead() {
    if (!userId || !isSupabaseConfigured) return;
    const readAt = new Date().toISOString();
    const supabase = createClient();
    const { error: updateError } = await supabase.from("notifications").update({ read_at: readAt }).is("read_at", null);
    if (updateError) setError(updateError.message);
    else setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt })));
  }

  return (
    <main className="social-shell">
      <SocialHeader />
      <section className="social-page-heading with-action">
        <div><p className="kicker">Activity</p><h1>Your inbox.</h1><p>Price drops, follow requests and updates from your wardrobe circle.</p></div>
        {notifications.some((notification) => !notification.read_at) && <button className="secondary-button" type="button" onClick={markAllRead}>Mark all read</button>}
      </section>
      {error && <div className="toast error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
      {loading ? <div className="social-loading">Loading notifications…</div> : !userId ? (
        <section className="social-empty"><span>Members only</span><h2>Log in to see your inbox.</h2><Link className="primary-button" href="/">Go to wardrobe</Link></section>
      ) : notifications.length ? (
        <div className="notification-list">
          {notifications.map((notification) => {
            const actor = notificationActor(notification);
            const product = notificationProduct(notification);
            const actorName = actor?.full_name || (actor ? `@${actor.username}` : "Someone");
            const isPriceDrop = notification.type === "price_drop";
            return (
              <article className={`notification-row ${notification.read_at ? "" : "unread"}`} key={notification.id}>
                {isPriceDrop
                  ? <a className="notification-avatar sale" href={product?.url || "/"} target={product?.url ? "_blank" : undefined} rel={product?.url ? "noopener noreferrer" : undefined}>$</a>
                  : actor
                    ? <Link className="notification-avatar" href={`/u/${actor.username}`}>{actorName.slice(0, 1).toUpperCase()}</Link>
                    : <span className="notification-avatar">?</span>}
                <div className="notification-copy">
                  <p>{notificationMessage(notification.type, actorName, product?.title)}</p>
                  <small>{isPriceDrop
                    ? <><s>{notificationPrice(notification.old_price_cents, notification.currency)}</s> → {notificationPrice(notification.new_price_cents, notification.currency)} · {notificationTime(notification.created_at)}</>
                    : notificationTime(notification.created_at)}</small>
                </div>
                {notification.type === "follow_request" && (
                  <div className="notification-actions">
                    <button className="primary-button" type="button" disabled={pendingId === notification.id} onClick={() => respond(notification, true)}>Accept</button>
                    <button className="secondary-button" type="button" disabled={pendingId === notification.id} onClick={() => respond(notification, false)}>Decline</button>
                  </div>
                )}
                {isPriceDrop && product?.url && <div className="notification-actions"><a className="secondary-button" href={product.url} target="_blank" rel="noopener noreferrer">View sale</a></div>}
                {!notification.read_at && <span className="unread-dot" aria-label="Unread" />}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="social-empty"><span>All quiet</span><h2>No notifications yet.</h2><p>Price drops, follow requests and approvals will appear here.</p></section>
      )}
    </main>
  );
}
