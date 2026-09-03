// lib/supabase.js
// Supabase Auth client — handles Google OAuth, email/password, JWT
// Free tier: 50,000 monthly active users

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// For local dev without Supabase: auth is optional — platform works without login
// For production: add SUPABASE_URL and SUPABASE_ANON_KEY to .env
let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      autoRefreshToken: true,
      persistSession:   true,        // stores session in localStorage
      detectSessionInUrl: true,      // handles OAuth redirect
    },
  });
}

export { supabase };

function sanitizeNextPath(nextPath) {
  if (!nextPath || typeof nextPath !== "string") return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("//")) return "/";
  return nextPath;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function signInWithGoogle(nextPath = "/") {
  if (!supabase) return { error: "Supabase not configured" };
  const safeNext = sanitizeNextPath(nextPath);
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
}

export async function signInWithEmail(email, password) {
  if (!supabase) return { error: "Supabase not configured" };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email, password) {
  if (!supabase) return { error: "Supabase not configured" };
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

export async function signOut() {
  if (!supabase) return;

  // Ensure browser session is removed even if network/global revocation fails.
  const clearClientAuthStorage = () => {
    if (typeof window === "undefined") return;

    const clearFrom = (store) => {
      if (!store) return;
      const keysToRemove = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i) || "";
        if (key.includes("supabase.auth.token") || /^sb-.*-auth-token$/.test(key)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => store.removeItem(key));
    };

    clearFrom(window.localStorage);
    clearFrom(window.sessionStorage);
  };

  const { error } = await supabase.auth.signOut({ scope: "local" });
  clearClientAuthStorage();

  if (error) {
    console.warn("Supabase signOut error:", error.message || error);
  }

  return { error };
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// ── Profile helpers ───────────────────────────────────────────────────────────

export async function syncProfileToBackend(user, profession = "general") {
  if (!user) return;
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    // Upsert user profile in our PostgreSQL (not Supabase's auth.users)
    await fetch(`${API}/api/profile/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${(await supabase?.auth.getSession())?.data?.session?.access_token || ""}`,
      },
      body: JSON.stringify({
        id:         user.id,
        email:      user.email,
        profession,
        avatar_url: user.user_metadata?.avatar_url || null,
        full_name:  user.user_metadata?.full_name  || null,
      }),
    });
  } catch (e) {
    console.warn("Profile sync failed:", e);
  }
}
