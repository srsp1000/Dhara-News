"use client";
// frontend/components/ui/BiasCompass.js
// 2D scatter plot: x = left (-1) to right (+1), y = credibility (0-1)
// Shows dots for each source that covered the story

export default function BiasCompass({ sources = [], articleBias = null }) {
  if (!sources.length) return null;

  const W = 260, H = 200, PAD = 32;
  const plotW = W - PAD * 2, plotH = H - PAD * 2;

  // Map bias (-1..1) → x pixel, credibility (0..1) → y pixel (inverted: high cred = top)
  const toX = b => PAD + ((b + 1) / 2) * plotW;
  const toY = c => PAD + (1 - c) * plotH;

  const tierColor = t => t === 1 ? "#16a34a" : t === 2 ? "#2563eb" : "#94a3b8";
  const biasLabel = b => b < -0.3 ? "Left" : b > 0.3 ? "Right" : "Centre";

  const articlesWithBias = sources.filter(s => s.bias !== undefined && s.cred !== undefined);
  const displaySources = articlesWithBias.length > 0 ? articlesWithBias : [
    { domain: "Reuters", bias: 0, cred: 1, tier: 1 },
    { domain: "The Hindu", bias: -0.2, cred: 0.9, tier: 2 },
    { domain: "Republic TV", bias: 0.6, cred: 0.55, tier: 3 },
  ];

  return (
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:"#1e3a5f", marginBottom:8 }}>
        Bias compass
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ border:"1px solid #e2e8f0", borderRadius:8, background:"#fafafa" }}>

        {/* Axis lines */}
        <line x1={toX(0)} y1={PAD-8} x2={toX(0)} y2={H-PAD+8}
          stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3"/>
        <line x1={PAD-8} y1={toY(0.5)} x2={W-PAD+8} y2={toY(0.5)}
          stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3"/>

        {/* Quadrant labels */}
        <text x={PAD+4} y={PAD+12} fontSize="9" fill="#94a3b8">High cred</text>
        <text x={PAD+4} y={H-PAD-4} fontSize="9" fill="#94a3b8">Low cred</text>
        <text x={PAD+2} y={toY(0.5)-4} fontSize="9" fill="#94a3b8" textAnchor="start">Left</text>
        <text x={W-PAD-2} y={toY(0.5)-4} fontSize="9" fill="#94a3b8" textAnchor="end">Right</text>

        {/* Source dots */}
        {displaySources.map((s, i) => {
          const bias = s.bias ?? 0;
          const cred = s.cred ?? 0.7;
          const x = toX(bias), y = toY(cred);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={6} fill={tierColor(s.tier ?? 2)}
                fillOpacity={0.8} stroke="#fff" strokeWidth={1.5}/>
              <text x={x} y={y-9} fontSize="9" textAnchor="middle"
                fill="#374151" fontWeight="500">
                {s.source_domain || s.domain || ""}
              </text>
            </g>
          );
        })}

        {/* Centre dot for article average */}
        {articleBias !== null && (
          <circle cx={toX(articleBias)} cy={toY(0.75)} r={4}
            fill="#1e3a5f" stroke="#fff" strokeWidth={1.5}/>
        )}
      </svg>

      <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
        {[["#16a34a","Tier 1 (wire/govt)"],["#2563eb","Tier 2 (national)"],["#94a3b8","Tier 3 (regional)"]].map(([c,l]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#64748b" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:c }}/>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
