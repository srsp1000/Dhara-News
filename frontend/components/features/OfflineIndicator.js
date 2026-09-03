"use client";
// OfflineIndicator.js — Shows offline banner + article cache status

import { useState, useEffect } from "react";

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const go  = () => { setOffline(false); setShow(true); setTimeout(() => setShow(false), 3000); };
    const off = () => { setOffline(true);  setShow(true); };
    window.addEventListener("online",  go);
    window.addEventListener("offline", off);
    if (!navigator.onLine) { setOffline(true); setShow(true); }
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", off); };
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 999, padding: "8px 18px", borderRadius: 20,
      background: offline ? "#1e293b" : "#166534",
      color: "#fff", fontSize: 13, fontWeight: 500,
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", gap: 8,
      animation: "slideUp 0.25s ease",
    }}>
      {offline ? "📵 You're offline — showing cached articles" : "✓ Back online"}
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </div>
  );
}

// Hook for components that need offline awareness
export function useOfflineCache() {
  const saveArticle = async (article) => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({ type: "CACHE_ARTICLE", url: `/article/${article.id}` });
    }
    // Also save to IndexedDB for article data
    try {
      const db = await openArticleDB();
      const tx = db.transaction("articles", "readwrite");
      tx.objectStore("articles").put({ ...article, cachedAt: Date.now() });
    } catch {}
  };

  const getCachedArticles = async () => {
    try {
      const db = await openArticleDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("articles", "readonly");
        const req = tx.objectStore("articles").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([]);
      });
    } catch { return []; }
  };

  return { saveArticle, getCachedArticles };
}

function openArticleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dhara-offline", 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("articles")) {
        db.createObjectStore("articles", { keyPath: "id" });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}
