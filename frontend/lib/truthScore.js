const HIGH_THRESHOLD = 75;
const MEDIUM_THRESHOLD = 50;
const LOW_THRESHOLD = 35;

export function normalizeTruthScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function formatTruthScorePercent(value) {
  return `${normalizeTruthScore(value)}%`;
}

export function truthScoreColor(value) {
  const score = normalizeTruthScore(value);
  if (score >= HIGH_THRESHOLD) return "#166534";
  if (score >= MEDIUM_THRESHOLD) return "#92400e";
  if (score >= LOW_THRESHOLD) return "#1e3a5f";
  return "#6b7280";
}

export function truthScoreBg(value) {
  const score = normalizeTruthScore(value);
  if (score >= HIGH_THRESHOLD) return "#dcfce7";
  if (score >= MEDIUM_THRESHOLD) return "#fef3c7";
  if (score >= LOW_THRESHOLD) return "#eff6ff";
  return "#f1f5f9";
}

export function statusLabel(status) {
  if (status === "verified") return "✓ Verified";
  if (status === "developing") return "↻ Developing";
  return "⚠ Unverified";
}
