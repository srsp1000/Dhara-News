"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SaveArticleButton({ articleId, headline }) {
    const { user, session, loading } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const safeArticleId = useMemo(() => String(articleId || "").trim(), [articleId]);

  useEffect(() => {
    if (!safeArticleId) return;
    if (loading) return;

    if (user?.id) {
        fetch(`${API}/api/save/${user.id}/${safeArticleId}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        })
        .then((r) => (r.ok ? r.json() : { saved: false }))
        .then((d) => setSaved(Boolean(d?.saved)))
        .catch(() => setSaved(false));
      return;
    }

    try {
      const saves = JSON.parse(localStorage.getItem("dhara_local_saves") || "[]");
      setSaved(saves.some((item) => String(item?.id) === safeArticleId));
    } catch {
      setSaved(false);
    }
  }, [safeArticleId, user?.id, session?.access_token, loading]);

  const onSaveToggle = async () => {
    if (!safeArticleId) return;

    if (user?.id) {
      if (busy) return;
      setBusy(true);
      try {
        const method = saved ? "DELETE" : "POST";
          const res = await fetch(`${API}/api/save/${user.id}/${safeArticleId}`, {
            method,
            headers: {
            Authorization: `Bearer ${session?.access_token || ""}`,
            },
          });
        if (res.ok) setSaved(!saved);
      } catch {
        // Keep UX stable when network/API is temporarily unavailable.
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const saves = JSON.parse(localStorage.getItem("dhara_local_saves") || "[]");
      const already = saves.some((item) => String(item?.id) === safeArticleId);

      if (already) {
        const next = saves.filter((item) => String(item?.id) !== safeArticleId);
        localStorage.setItem("dhara_local_saves", JSON.stringify(next));
        setSaved(false);
        return;
      }

      const next = [
        { id: safeArticleId, headline: headline || safeArticleId, saved: Date.now() },
        ...saves,
      ];
      localStorage.setItem("dhara_local_saves", JSON.stringify(next.slice(0, 100)));
      setSaved(true);
    } catch {
      // Keep UX stable even if storage is unavailable.
    }
  };

  return (
    <button
      type="button"
      suppressHydrationWarning
      data-article-id={safeArticleId}
      onClick={onSaveToggle}
      disabled={busy}
      style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "10px",
        background: saved ? "var(--bg3)" : "var(--bg2)",
        color: saved ? "#166534" : "var(--text2)",
        border: "1px solid var(--border)",
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.75 : 1,
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 2,
        marginBottom: 8,
        letterSpacing: 0.3,
        fontFamily: "inherit",
      }}
    >
      {busy ? "Saving..." : saved ? "✓ Saved!" : "🔖 Save article"}
    </button>
  );
}