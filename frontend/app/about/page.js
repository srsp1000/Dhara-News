"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AboutPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/stats`).then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 1rem" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex",
          alignItems: "center", gap: "1rem", height: 52 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 20, fontWeight: 800, color: "#1e3a5f" }}>धारा</a>
          <span style={{ color: "#94a3b8" }}>›</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>About & Transparency</span>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1rem" }}>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", margin: "0 0 8px" }}>
          About Dhara News
        </h1>
        <p style={{ fontSize: 15, color: "#64748b", margin: "0 0 2rem", lineHeight: 1.7 }}>
          Dhara (धारा) is Sanskrit for <em>continuous flow</em> — the unending stream of truth.
          We are India's first AI-verified news platform with profession-based personalization.
        </p>

        {/* Live stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: "2rem" }}>
            {[
              { label: "Stories verified", value: stats.verified_stories?.toLocaleString("en-IN") },
              { label: "Active sources", value: stats.active_sources?.toLocaleString("en-IN") },
              { label: "Verification rate", value: `${stats.verification_rate}%` },
              { label: "Published today", value: stats.stories_today?.toLocaleString("en-IN") },
              { label: "In quarantine", value: stats.quarantined?.toLocaleString("en-IN") },
              { label: "Total processed", value: stats.total_stories?.toLocaleString("en-IN") },
            ].map(s => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 12, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#1e3a5f" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* How verification works */}
        <Section title="How verification works">
          <p>Every article published on Dhara goes through an 8-stage automated pipeline before it reaches you:</p>
          {[
            ["Claim extraction", "We extract individual factual claims from each article using AI."],
            ["Cross-referencing", "Each claim is matched against thousands of claims from other sources in the past 48 hours. A claim confirmed by multiple independent sources scores higher."],
            ["Source credibility", "Every source has a credibility tier (1–4) based on editorial standards, track record, and ownership. Government wire services and established national outlets score highest."],
            ["Truth Score", "We combine source confirmations, credibility weights, and time signals into a single 0–100 Truth Score. This updates every 30 minutes for 48 hours after publication."],
            ["Contradiction detection", "If two Tier-1 or Tier-2 sources report opposing facts about the same event, we surface a 'Sources conflict' banner so you know before reading."],
            ["Satire detection", "We maintain a blocklist of known satire sites and run a language model to catch satirical framing in new sources."],
            ["Fake signal scoring", "Sensational headlines, missing source attribution, ALL CAPS, and excessive punctuation all reduce a story's Truth Score."],
            ["Publication gate", "Stories scoring below 35 are quarantined — not deleted, but published separately with a clear 'Unverified' label. You can browse them, but they never appear in the main feed."],
          ].map(([title, desc]) => (
            <div key={title} style={{ marginBottom: 14, paddingLeft: 16,
              borderLeft: "3px solid #bfdbfe" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1e3a5f", marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </Section>

        <Section title="Our editorial principles">
          {[
            "No political party advertising — ever.",
            "No ads on crisis or breaking news stories.",
            "Morning briefs are always ad-free.",
            "We never build behavioral profiles of readers.",
            "Personalization is based on profession you choose, not your click history.",
            "Quarantined articles are published transparently — we do not silently delete.",
            "Bias reports are generated weekly and published here.",
            "No satirical content published as real news.",
          ].map(p => (
            <div key={p} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 14, color: "#374151" }}>
              <span style={{ color: "#0f7b6c", flexShrink: 0 }}>✓</span>
              <span>{p}</span>
            </div>
          ))}
        </Section>

        <Section title="Technology">
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7 }}>
            Dhara runs on 42 autonomous AI agents organized into 8 processing clusters.
            The platform crawls 5,000+ sources every 15 minutes, processes articles through
            an 8-stage verification pipeline, and serves personalized feeds to 12 profession
            segments — all fully automated, 24 hours a day.
            Local LLM inference (Ollama / llama3) powers summarization without sending
            article data to third-party APIs.
          </p>
        </Section>

        <Section title="Contact">
          <p style={{ fontSize: 14, color: "#475569" }}>
            For editorial queries, incorrect verification, or source suggestions:
            <a href="mailto:editorial@dhara.news" style={{ color: "#1e3a5f", marginLeft: 4 }}>
              editorial@dhara.news
            </a>
          </p>
          <p style={{ fontSize: 14, color: "#475569" }}>
            To report a fake news story we missed:{" "}
            <a href="mailto:verify@dhara.news" style={{ color: "#1e3a5f" }}>
              verify@dhara.news
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b",
        margin: "0 0 14px", paddingBottom: 8,
        borderBottom: "1px solid #e2e8f0" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
