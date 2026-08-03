export type FollowStatus = "pending" | "accepted";
export type NotificationType = "follow_request" | "follow_accepted" | "new_follower" | "price_drop";

export type SocialProfile = {
  user_id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string;
  is_private: boolean;
  share_saved: boolean;
  share_closet: boolean;
  follower_count: number;
  following_count: number;
};

export type FollowRelationship = {
  follower_id: string;
  following_id: string;
  status: FollowStatus;
  created_at: string;
  accepted_at: string | null;
};

export type SocialNotification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  product_id: string | null;
  old_price_cents: number | null;
  new_price_cents: number | null;
  currency: string | null;
  read_at: string | null;
  created_at: string;
  actor?: SocialProfile | SocialProfile[] | null;
  product?: NotificationProduct | NotificationProduct[] | null;
};

export type NotificationProduct = {
  id: string;
  title: string;
  url: string;
  image_url: string;
  price_cents: number | null;
  original_price_cents: number | null;
  currency: string;
};

export function followActionLabel(status: FollowStatus | null, isPrivate: boolean) {
  if (status === "accepted") return "Following";
  if (status === "pending") return "Requested";
  return isPrivate ? "Request to follow" : "Follow";
}

export function notificationMessage(type: NotificationType, actorName: string, productTitle = "A saved item") {
  if (type === "price_drop") return `${productTitle} just dropped in price.`;
  if (type === "follow_request") return `${actorName} requested to follow you.`;
  if (type === "follow_accepted") return `${actorName} accepted your follow request.`;
  return `${actorName} followed you.`;
}

export function notificationActor(notification: SocialNotification) {
  const actor = Array.isArray(notification.actor) ? notification.actor[0] : notification.actor;
  return actor ?? null;
}

export function notificationProduct(notification: SocialNotification) {
  const product = Array.isArray(notification.product) ? notification.product[0] : notification.product;
  return product ?? null;
}
