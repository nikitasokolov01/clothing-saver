import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://clothing-saver.vercel.app",
]);

function isAllowedOrigin(origin: string) {
  return allowedOrigins.has(origin)
    || /^https:\/\/clothing-saver(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin);
}
const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const invalidCredentials = (headers: Record<string, string>) => new Response(
  JSON.stringify({ error: "Invalid username or password." }),
  { status: 401, headers },
);

async function hashAttemptKey(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (!isAllowedOrigin(origin)) return new Response("Forbidden", { status: 403 });
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
  }

  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 6) return invalidCredentials(headers);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Login is temporarily unavailable." }), { status: 503, headers });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const attemptKey = await hashAttemptKey(`${clientIp}:${username}`);
    const { data: allowed, error: rateLimitError } = await admin.rpc("allow_username_login_attempt", { p_attempt_key: attemptKey });
    if (rateLimitError || !allowed) return invalidCredentials(headers);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();
    if (profileError || !profile?.user_id) return invalidCredentials(headers);

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(profile.user_id);
    const email = account.user?.email;
    if (accountError || !email) return invalidCredentials(headers);

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: login, error: loginError } = await authClient.auth.signInWithPassword({ email, password });
    if (loginError || !login.session) return invalidCredentials(headers);

    return new Response(JSON.stringify({
      access_token: login.session.access_token,
      refresh_token: login.session.refresh_token,
    }), { status: 200, headers });
  } catch {
    const origin = request.headers.get("origin") || "";
    return invalidCredentials({ ...corsHeaders(origin), "Content-Type": "application/json" });
  }
});
