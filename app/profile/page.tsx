import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { WardrobeApp } from "../wardrobe-app";

export const metadata: Metadata = {
  title: "Profile · Saved",
  description: "Your profile, saved pieces, and closet.",
};

type Props = { searchParams: Promise<{ add?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims.sub) redirect("/");
  }

  const { add } = await searchParams;
  return <WardrobeApp mode="profile" focusImporter={add === "1"} />;
}
