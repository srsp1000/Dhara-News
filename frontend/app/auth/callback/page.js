"use client";
// app/auth/callback/page.js
// Handles the redirect back from Google OAuth
// Supabase exchanges the code for a session automatically

import { useEffect } from "react";
import { supabase, syncProfileToBackend } from "../../../lib/supabase";

function sanitizeNextPath(nextPath) {
  if (!nextPath || typeof nextPath !== "string") return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("//")) return "/";
  return nextPath;
}

export default function AuthCallbackPage() {

  useEffect(() => {
    // Supabase SDK auto-handles the hash/query params in the URL
    // and sets the session. We just need to wait and redirect.
    const handle = async () => {
      if (!supabase) {
        window.location.href = "/";
        return;
      }

      // Wait for session (the SDK processes the URL automatically)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { data } = await supabase.auth.getSession();
      const session  = data?.session;
      const user     = session?.user;
      const accessToken = session?.access_token || "";

      if (user) {
        // Apply any pending profession from signup flow
        const pending = localStorage.getItem("dhara_pending_profession") || "general";
        localStorage.removeItem("dhara_pending_profession");
        await syncProfileToBackend(user, pending);

        // Move guest saves into account-backed saves once login completes.
        const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const localRaw = localStorage.getItem("dhara_local_saves") || "[]";
        let localSaves = [];
        try {
          localSaves = JSON.parse(localRaw);
        } catch {
          localSaves = [];
        }

        if (Array.isArray(localSaves) && localSaves.length > 0) {
          await Promise.all(
            localSaves
              .map((item) => String(item?.id || "").trim())
              .filter(Boolean)
              .slice(0, 100)
              .map((clusterId) =>
                fetch(`${API}/api/save/${user.id}/${clusterId}`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                }).catch(() => null)
              )
          );
          localStorage.removeItem("dhara_local_saves");
        }
      }

      // Redirect to homepage (or intended destination)
      const nextRaw = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = sanitizeNextPath(nextRaw);
    };

    handle();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui",
      background: "#f1f5f9", gap: 16 }}>
      <span style={{ fontSize: 36 }}>🔐</span>
      <p style={{ fontSize: 15, color: "#374151", margin: 0 }}>Signing you in...</p>
      <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>You'll be redirected shortly.</p>
    </div>
  );
}
