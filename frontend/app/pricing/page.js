"use client";
// frontend/app/pricing/page.js
import React from "react";
import { useAuth } from "../../components/auth/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FREE_FEATURES = [
  "Verified news with Truth Scores",
  "12 profession feeds",
  "Exam relevance tagging (UPSC, NEET, etc.)",
  "Date archive + full-text search",
  "Morning brief (limited — 5 stories)",
  "10 article saves",
  "Location-based news",
];

const PRO_FEATURES = [
  "Everything in Free, plus:",
  "Ad-free reading experience",
  "Unlimited article saves",
  "Full morning brief (10 stories)",
  "PDF export of study bank",
  "Flashcard generator from saves",
  "Offline reading (up to 200 articles)",
  "Language switching (Hindi, Tamil, Telugu...)",
  "API access for research (100 calls/day)",
  "Priority support",
];

export default function PricingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [billing, setBilling] = React.useState("monthly"); // monthly | yearly

  const prices = {
    monthly: { inr: 99,  usd: 1.2,  label: "/month" },
    yearly:  { inr: 799, usd: 9.6,  label: "/year", saving: "Save ₹389" },
  };
  const price = prices[billing];

  const handleCheckout = async () => {
    if (!user) { window.location.href = "/signup?next=/pricing"; return; }
    setLoading(true);
    const res = await fetch(`${API}/api/subscriptions/create-checkout`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ user_id: user.id, plan: billing, currency: "INR" }),
    }).then(r => r.json()).catch(() => null);

    if (res?.checkout_url) {
      window.location.href = res.checkout_url;
    } else {
      setLoading(false);
      // Razorpay not configured — direct to contact
      if (confirm("Payment gateway is being set up. Would you like to contact us to arrange Pro access?")) {
        window.location.href = "/contact?subject=" + encodeURIComponent("Pro upgrade - " + billing);
      }
    }
  };

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", background:"#f1f5f9", minHeight:"100vh" }}>
      <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"0 1rem" }}>
        <div style={{ maxWidth:900, margin:"0 auto", display:"flex",
          alignItems:"center", gap:"1rem", height:52 }}>
          <a href="/" style={{ textDecoration:"none", fontSize:20, fontWeight:800, color:"#1e3a5f" }}>धारा</a>
          <span style={{ color:"#94a3b8" }}>›</span>
          <span style={{ fontSize:14, fontWeight:600, color:"#475569" }}>Pricing</span>
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"2.5rem 1rem", textAlign:"center" }}>
        <h1 style={{ fontSize:28, fontWeight:800, color:"#1e293b", margin:"0 0 8px" }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize:15, color:"#64748b", margin:"0 0 2rem" }}>
          Dhara Pro removes all ads and unlocks every feature. One price, everything included.
        </p>

        {/* Billing toggle */}
        <div style={{ display:"flex", gap:4, background:"#f1f5f9", borderRadius:10,
          padding:4, width:"fit-content", margin:"0 auto 2rem" }}>
          {["monthly","yearly"].map(b => (
            <button key={b} onClick={() => setBilling(b)}
              style={{ padding:"7px 20px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:13, fontWeight: billing===b ? 600 : 400,
                background: billing===b ? "#fff" : "transparent",
                color: billing===b ? "#1e3a5f" : "#64748b",
                boxShadow: billing===b ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>
              {b.charAt(0).toUpperCase()+b.slice(1)}
              {b==="yearly" && (
                <span style={{ marginLeft:5, fontSize:10, background:"#dcfce7",
                  color:"#166534", padding:"1px 6px", borderRadius:8, fontWeight:600 }}>
                  Save 33%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="pricing-plan-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, maxWidth:700, margin:"0 auto" }}>

          {/* Free */}
          <div style={{ background:"#fff", border:"1px solid #e2e8f0",
            borderRadius:16, padding:"1.5rem", textAlign:"left" }}>
            <p style={{ fontSize:16, fontWeight:700, color:"#1e293b", margin:"0 0 4px" }}>Free</p>
            <p style={{ fontSize:28, fontWeight:800, color:"#1e293b", margin:"0 0 4px" }}>₹0</p>
            <p style={{ fontSize:13, color:"#94a3b8", margin:"0 0 16px" }}>Forever</p>
            <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:14 }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display:"flex", gap:8, marginBottom:8, fontSize:13, color:"#374151" }}>
                  <span style={{ color:"#16a34a", flexShrink:0 }}>✓</span>{f}
                </div>
              ))}
            </div>
            <a href="/signup" style={{ display:"block", marginTop:16, padding:"10px",
              background:"#f1f5f9", color:"#1e3a5f", borderRadius:10,
              textDecoration:"none", fontSize:13, fontWeight:600, textAlign:"center" }}>
              Get started free
            </a>
          </div>

          {/* Pro */}
          <div style={{ background:"#1e3a5f", border:"2px solid #1e3a5f",
            borderRadius:16, padding:"1.5rem", textAlign:"left", position:"relative" }}>
            <div style={{ position:"absolute", top:-10, right:14, fontSize:11,
              background:"#fcd34d", color:"#78350f", padding:"2px 10px",
              borderRadius:12, fontWeight:700 }}>
              MOST POPULAR
            </div>
            <p style={{ fontSize:16, fontWeight:700, color:"#fff", margin:"0 0 4px" }}>Dhara Pro</p>
            <p style={{ margin:0 }}>
              <span style={{ fontSize:28, fontWeight:800, color:"#fff" }}>₹{price.inr}</span>
              <span style={{ fontSize:13, color:"#93c5fd", marginLeft:4 }}>{price.label}</span>
            </p>
            {billing==="yearly" && (
              <p style={{ fontSize:11, color:"#86efac", margin:"2px 0 14px", fontWeight:600 }}>
                {price.saving}
              </p>
            )}
            <p style={{ fontSize:13, color:"#93c5fd", margin:"4px 0 16px" }}>
              ~₹{Math.round(price.inr / (billing==="yearly"?12:1))}/month
            </p>
            <div style={{ borderTop:"1px solid rgba(255,255,255,.15)", paddingTop:14 }}>
              {PRO_FEATURES.map(f => (
                <div key={f} style={{ display:"flex", gap:8, marginBottom:8, fontSize:13,
                  color: f.startsWith("Everything") ? "#86efac" : "#e2e8f0" }}>
                  <span style={{ color:"#86efac", flexShrink:0 }}>
                    {f.startsWith("Everything") ? "+" : "✓"}
                  </span>{f}
                </div>
              ))}
            </div>
            <button onClick={handleCheckout} disabled={loading}
              style={{ display:"block", width:"100%", marginTop:16, padding:"11px",
                background:"#fcd34d", color:"#78350f", border:"none", borderRadius:10,
                fontSize:13, fontWeight:700, cursor:"pointer", opacity:loading?0.7:1 }}>
              {loading ? "Loading..." : user ? "Upgrade to Pro" : "Sign up & subscribe"}
            </button>
            <p style={{ fontSize:11, color:"#93c5fd", textAlign:"center", marginTop:8 }}>
              Pay with UPI, card, or net banking via Razorpay
            </p>
          </div>
        </div>

        {/* Institution */}
        <div style={{ maxWidth:700, margin:"2rem auto 0",
          background:"#fff", border:"1px solid #e2e8f0", borderRadius:12,
          padding:"1.2rem 1.5rem", textAlign:"left" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
            <div>
              <p style={{ fontSize:15, fontWeight:700, color:"#1e293b", margin:"0 0 3px" }}>
                Institution Licensing
              </p>
              <p style={{ fontSize:13, color:"#64748b", margin:0 }}>
                For coaching institutes, law schools, medical colleges. White-label daily current affairs dashboard for your students.
              </p>
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <p style={{ fontSize:14, fontWeight:700, color:"#1e3a5f", margin:"0 0 6px" }}>
                From ₹5,000/month
              </p>
              <a href="mailto:partnerships@dhara.news"
                style={{ padding:"7px 16px", background:"#1e3a5f", color:"#fff",
                  borderRadius:8, textDecoration:"none", fontSize:12, fontWeight:600 }}>
                Contact us
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
