import { FeedClient } from "./feed-client";

export const metadata = {
  title: "Feed · Saved",
  description: "New saved pieces and closet additions from people you follow.",
};

export default function FeedPage() {
  return <FeedClient />;
}
