import { WardrobeApp } from "./wardrobe-app";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";

export default async function Home() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims.sub) redirect("/feed");
  }

  return <WardrobeApp />;
}
