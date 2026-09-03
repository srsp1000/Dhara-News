"use client";

// ── Privacy Policy ────────────────────────────────────────────────────────────
export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy Policy" updated="March 2026">
      <Section title="What we collect">
        <ul style={{ margin: "6px 0", paddingLeft: 20, lineHeight: 1.8, color: "#475569" }}>
          <li>Email address and name (when you create an account)</li>
          <li>Profession and location (what you choose in preferences)</li>
          <li>Exam name and date (if you enter them in your profile)</li>
          <li>Articles you save (linked to your account)</li>
          <li>Anonymized view counts per article (no user ID attached to views)</li>
        </ul>
      </Section>
      <Section title="What we do NOT collect">
        <ul style={{ margin: "6px 0", paddingLeft: 20, lineHeight: 1.8, color: "#475569" }}>
          <li>Your click history or reading behavior for advertising purposes</li>
          <li>Device fingerprints</li>
          <li>Location beyond the state/city you choose to enter</li>
          <li>Any data for sale to third parties</li>
        </ul>
      </Section>
      <Section title="How we use your data">
        We use your profession and location exclusively to curate your news feed.
        We use your email to send your morning brief (only if you enable it).
        We do not build advertising profiles. We do not sell your data to anyone, ever.
      </Section>
      <Section title="Advertising">
        We show contextual ads based on the article topic — not based on your identity or
        browsing history. A legal article shows law-related ads regardless of who is reading it.
        This means we comply with DPDP (India's Digital Personal Data Protection Act, 2023)
        by default — no consent banners needed for contextual advertising.
      </Section>
      <Section title="Data storage">
        Your account data is stored in Supabase (hosted on AWS Singapore region).
        We retain account data as long as your account exists. You can delete your account
        at any time from your profile settings, which permanently removes all your data.
      </Section>
      <Section title="Cookies">
        We use one session cookie to keep you logged in. We use no third-party tracking cookies.
        No Google Analytics. No Meta Pixel. No ad tracking scripts.
      </Section>
      <Section title="Your rights (DPDP 2023)">
        You have the right to: access your personal data, correct inaccurate data, erase your data,
        and withdraw consent. Contact privacy@dhara.news to exercise these rights.
      </Section>
      <Section title="Contact">
        privacy@dhara.news
      </Section>
    </StaticPage>
  );
}

// ── Shared StaticPage layout ──────────────────────────────────────────────────
export function StaticPage({ title, updated, children }) {
  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 1rem" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex",
          alignItems: "center", gap: "1rem", height: 52 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 20, fontWeight: 800, color: "#1e3a5f" }}>धारा</a>
          <span style={{ color: "#94a3b8" }}>›</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>{title}</span>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1e293b", margin: "0 0 6px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 2rem" }}>Last updated: {updated}</p>
        {children}
        <div style={{ marginTop: "2rem", padding: "1rem", background: "#fff",
          border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#64748b" }}>
          Questions? Email us at{" "}
          <a href="mailto:hello@dhara.news" style={{ color: "#1e3a5f" }}>hello@dhara.news</a>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b",
        margin: "0 0 8px", paddingBottom: 6, borderBottom: "1px solid #f1f5f9" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  );
}
