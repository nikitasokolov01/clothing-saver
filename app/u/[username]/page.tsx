import type { Metadata } from "next";
import { ProfileClient } from "./profile-client";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} · Saved`,
    description: `See @${username}'s saved pieces and closet.`,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  return <ProfileClient username={username.toLowerCase()} />;
}
