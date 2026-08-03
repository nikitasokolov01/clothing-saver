export type FollowStatus = "pending" | "accepted";
export type NotificationType = "follow_request" | "follow_accepted" | "new_follower";

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
  actor_id: string;
  type: NotificationType;
  read_at: string | null;
  created_at: string;
  actor?: SocialProfile | SocialProfile[] | null;
};

export function followActionLabel(status: FollowStatus | null, isPrivate: boolean) {
  if (status === "accepted") return "Following";
  if (status === "pending") return "Requested";
  return isPrivate ? "Request to follow" : "Follow";
}

export function notificationMessage(type: NotificationType, actorName: string) {
  if (type === "follow_request") return `${actorName} requested to follow you.`;
  if (type === "follow_accepted") return `${actorName} accepted your follow request.`;
  return `${actorName} followed you.`;
}

export function notificationActor(notification: SocialNotification) {
  const actor = Array.isArray(notification.actor) ? notification.actor[0] : notification.actor;
  return actor ?? null;
}
