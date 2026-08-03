import { NotificationsClient } from "./notifications-client";

export const metadata = {
  title: "Inbox · Saved",
  description: "Follow requests and social updates.",
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
