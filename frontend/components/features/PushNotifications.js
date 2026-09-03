"use client";
// PushNotifications.js — Web Push opt-in UI + subscription management
// Uses VAPID + service worker push events
// Backend needs: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL env vars

import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useThemeValues } from "../../lib/useThemeValues";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationBell({ profession }) {
  const t = useThemeValues();
  const { user } = useAuth();
  const [status, setStatus]   = useState("idle"); // idle | granted | denied | unsupported
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported"); return;
    }
    setStatus(Notification.permission === "granted" ? "granted"
            : Notification.permission === "denied"  ? "denied"
            : "idle");
  }, []);

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !VAPID_PUBLIC_KEY) return;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); setLoading(false); return; }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Register subscription with backend
      await fetch(`${API}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          user_id: user?.id || null,
          profession: profession || "general",
        }),
      });

      setStatus("granted");
    } catch (e) {
      console.error("Push subscribe error:", e);
    }
    setLoading(false);
    setOpen(false);
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch(`${API}/api/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setStatus("idle");
    } catch (e) { console.error(e); }
    setLoading(false);
    setOpen(false);
  };

  if (status === "unsupported") return null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={status === "granted" ? "Notifications on" : "Get breaking news alerts"}
        style={{
          width: 34, height: 34, borderRadius: 8,
          border: `1px solid ${status === "granted" ? "#22c55e" : t.border}`,
          background: status === "granted" ? "#dcfce7" : t.bg2,
          cursor: "pointer", fontSize: 15,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
        🔔
        {status === "granted" && (
          <span style={{
            position: "absolute", top: 4, right: 4, width: 8, height: 8,
            background: "#22c55e", borderRadius: "50%",
            border: "1.5px solid white",
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)",
          background: t.bg2, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: "1rem 1.2rem",
          boxShadow: `0 8px 24px ${t.shadow}`,
          width: 260, zIndex: 400,
        }}>
          {status === "granted" ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 6 }}>
                🔔 Notifications active
              </div>
              <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5, marginBottom: 12 }}>
                You'll receive alerts for breaking news in your <strong>{profession}</strong> feed.
              </div>
              <button onClick={unsubscribe} disabled={loading}
                style={{
                  width: "100%", padding: "8px", borderRadius: 8,
                  border: `1px solid ${t.border}`, background: t.bg3,
                  color: t.text2, fontSize: 12, cursor: "pointer",
                }}>
                {loading ? "Unsubscribing..." : "Turn off notifications"}
              </button>
            </>
          ) : status === "denied" ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 6 }}>
                Notifications blocked
              </div>
              <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5 }}>
                Enable notifications in your browser settings to receive breaking news alerts.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 6 }}>
                Breaking news alerts
              </div>
              <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.5, marginBottom: 12 }}>
                Get notified instantly when high-confidence breaking news matches your <strong>{profession}</strong> feed.
              </div>
              {["Verified stories only (score 75+)", "Exam-tagged alerts for UPSC/NEET", "No ads, no spam"].map(f => (
                <div key={f} style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>
                  ✓ {f}
                </div>
              ))}
              <button onClick={subscribe} disabled={loading}
                style={{
                  marginTop: 12, width: "100%", padding: "9px",
                  borderRadius: 8, border: "none",
                  background: "#1e3a5f", color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                {loading ? "Enabling..." : "Enable alerts"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
