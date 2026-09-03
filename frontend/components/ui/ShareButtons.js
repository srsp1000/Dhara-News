"use client";
// frontend/components/ui/ShareButtons.js
import React, { useEffect, useRef, useState } from "react";

export function ShareButtons({ article }) {
  if (!article) return null;
  const url  = typeof window !== "undefined"
    ? `${window.location.origin}/article/${article.id}` : "";
  const text = encodeURIComponent(
    `${article.headline} — Truth Score: ${article.truth_score}/100 | Dhara News`
  );
  const fullUrl = encodeURIComponent(url);

  const buttons = [
    {
      label: "WhatsApp",
      color: "#25D366",
      href:  `https://wa.me/?text=${text}%20${fullUrl}`,
      icon:  "W",
    },
    {
      label: "X (Twitter)",
      color: "#000",
      href:  `https://twitter.com/intent/tweet?text=${text}&url=${fullUrl}`,
      icon:  "𝕏",
    },
    {
      label: "LinkedIn",
      color: "#0A66C2",
      href:  `https://www.linkedin.com/shareArticle?mini=true&url=${fullUrl}&title=${text}`,
      icon:  "in",
    },
    {
      label: "Copy link",
      color: "#475569",
      onClick: () => { navigator.clipboard?.writeText(url); },
      icon:  "🔗",
    },
    {
      label: "Share image",
      color: "#1e3a5f",
      href: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/article/${article.id}/share-card`,
      icon: "🖼",
      download: true,
    },
  ];

  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
      {buttons.map(b => (
        b.href ? (
          <a key={b.label} href={b.href} target={b.download ? "_self" : "_blank"}
            download={b.download ? `dhara-${article.id}.png` : undefined}
            rel="noopener noreferrer"
            style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px",
              borderRadius:8, border:"1px solid #e2e8f0", textDecoration:"none",
              fontSize:12, color:"#fff", background:b.color, fontWeight:500 }}>
            <span style={{ fontSize:13 }}>{b.icon}</span>{b.label}
          </a>
        ) : (
          <button key={b.label} onClick={b.onClick}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px",
              borderRadius:8, border:"1px solid #e2e8f0", cursor:"pointer",
              fontSize:12, color:"#fff", background:b.color, fontWeight:500 }}>
            <span style={{ fontSize:13 }}>{b.icon}</span>{b.label}
          </button>
        )
      ))}
    </div>
  );
}

// ── Audio TTS Player ──────────────────────────────────────────────────────────
export function AudioPlayer({ text, headline }) {
  const [playing, setPlaying] = useState(false);
  const [supported] = useState(() =>
    typeof window !== "undefined" && "speechSynthesis" in window
  );
  const uttRef = useRef(null);

  const toggle = () => {
    if (!supported) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      const utt = new SpeechSynthesisUtterance(text || headline);
      utt.lang  = "en-IN";
      utt.rate  = 0.95;
      utt.pitch = 1;
      utt.onend = () => setPlaying(false);
      uttRef.current = utt;
      window.speechSynthesis.speak(utt);
      setPlaying(true);
    }
  };

  if (!supported) return null;

  return (
    <button onClick={toggle} title={playing ? "Stop audio" : "Listen to article"}
      style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px",
        borderRadius:8, border:"1px solid #e2e8f0", cursor:"pointer",
        fontSize:12, background:"#fff", color:"#475569", fontWeight:500 }}>
      {playing ? "⏹ Stop" : "🔊 Listen"}
    </button>
  );
}

// Fix: AudioPlayer uses hooks inline — proper component
export function AudioPlayerComponent({ text, headline }) {
  const [playing, setPlaying] = React.useState(false);
  const uttRef = React.useRef(null);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const toggle = () => {
    if (!supported) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      const utt = new SpeechSynthesisUtterance(text || headline || "");
      utt.lang  = "en-IN";
      utt.rate  = 0.9;
      utt.onend = () => setPlaying(false);
      utt.onerror= () => setPlaying(false);
      uttRef.current = utt;
      window.speechSynthesis.speak(utt);
      setPlaying(true);
    }
  };

  if (!supported) return null;

  return (
    <button onClick={toggle} title={playing ? "Stop" : "Listen"}
      style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px",
        borderRadius:8, border:"1px solid #e2e8f0", cursor:"pointer",
        fontSize:12, background:"#fff", color:"#475569" }}>
      {playing ? "⏹ Stop" : "🔊 Listen"}
    </button>
  );
}

// ── Related Perspectives (same story, 3 different leans) ─────────────────────
export function RelatedPerspectives({ clusterId }) {
  const [persp, setPersp] = React.useState([]);
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!clusterId) return;
    fetch(`${API}/api/article/${clusterId}/perspectives`)
      .then(r => r.json())
      .then(d => setPersp(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [clusterId]);

  if (!persp.length) return null;

  const leanLabel = b => b < -0.2 ? "Left-leaning" : b > 0.2 ? "Right-leaning" : "Centre";
  const leanColor = b => b < -0.2 ? "#2563eb" : b > 0.2 ? "#dc2626" : "#16a34a";

  return (
    <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:14, marginTop:14 }}>
      <p style={{ fontSize:13, fontWeight:600, color:"#1e3a5f", margin:"0 0 10px" }}>
        Same story, different perspectives
      </p>
      {persp.slice(0,3).map((s, i) => (
        <a key={i} href={s.original_url} target="_blank" rel="noopener noreferrer"
          style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"8px 0", borderBottom:"1px solid #f8fafc", textDecoration:"none" }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:"#1e293b" }}>{s.source_domain}</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{s.original_title?.slice(0,60)}...</div>
          </div>
          <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10, flexShrink:0,
            background:`${leanColor(s.bias||0)}20`, color:leanColor(s.bias||0), fontWeight:600 }}>
            {leanLabel(s.bias||0)}
          </span>
        </a>
      ))}
    </div>
  );
}
