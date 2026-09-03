// frontend/lib/constants.js
// Single source of truth for all shared constants
// FIX: added "education" to PROFESSIONS (was missing)
// NEW:  EXAM_TAGS — mirrors agents/nlp/__init__.py EXAM_KEYWORD_MAP

export const PROFESSIONS = [
  { key: "general",     label: "General",        icon: "📰" },
  { key: "upsc",        label: "Civil Services",  icon: "🏛️" },
  { key: "medical",     label: "Medical",         icon: "🩺" },
  { key: "law",         label: "Law",             icon: "⚖️" },
  { key: "technology",  label: "Tech",            icon: "💻" },
  { key: "finance",     label: "Finance",         icon: "📈" },
  { key: "student",     label: "Students",        icon: "🎓" },
  { key: "environment", label: "Environment",     icon: "🌱" },
  { key: "defence",     label: "Defence",         icon: "🛡️" },
  { key: "agriculture", label: "Agriculture",     icon: "🚜" },
  { key: "research",    label: "Research",        icon: "🔬" },
  { key: "education",   label: "Education",       icon: "📚" },
];

// Domains must exactly match what agents/nlp/__init__.py DOMAIN_KEYWORDS assigns
export const DOMAINS = [
  "All",
  "politics", "economy", "judiciary", "health", "technology",
  "science", "environment", "business", "international", "sports",
  "social", "agriculture", "defence", "education", "national",
  "entertainment",
];

// Domain display labels + icons
export const DOMAIN_LABELS = {
  politics:      { label: "Politics",      icon: "🏛️" },
  economy:       { label: "Economy",       icon: "📈" },
  judiciary:     { label: "Courts & Law",  icon: "⚖️" },
  health:        { label: "Health",        icon: "🏥" },
  technology:    { label: "Technology",    icon: "💻" },
  science:       { label: "Science",       icon: "🔬" },
  environment:   { label: "Environment",   icon: "🌿" },
  business:      { label: "Business",      icon: "💼" },
  international: { label: "World",         icon: "🌍" },
  sports:        { label: "Sports",        icon: "🏏" },
  social:        { label: "Society",       icon: "👥" },
  agriculture:   { label: "Agriculture",   icon: "🚜" },
  defence:       { label: "Defence",       icon: "🛡️" },
  education:     { label: "Education",     icon: "📚" },
  national:      { label: "National",      icon: "🇮🇳" },
  entertainment: { label: "Entertainment", icon: "🎬" },
};

export const DOMAIN_COLORS = {
  politics: "#dc2626",
  economy: "#16a34a",
  health: "#2563eb",
  technology: "#7c3aed",
  judiciary: "#b45309",
  environment: "#15803d",
  sports: "#ea580c",
  science: "#0891b2",
  international: "#be185d",
  business: "#1d4ed8",
  agriculture: "#65a30d",
  defence: "#374151",
  education: "#7c3aed",
  social: "#db2777",
  national: "#1e3a5f",
  entertainment: "#c026d3",
  general: "#475569",
};

export function getDomainLabel(domain) {
  return DOMAIN_LABELS[domain]?.label || (domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : "General");
}
export function getDomainIcon(domain) {
  return DOMAIN_LABELS[domain]?.icon || "📰";
}

// ── Exam tags — mirrors EXAM_KEYWORD_MAP in agents/nlp/__init__.py ───────────
// Used by Header exam-filter strip, ArticleCard badge, and /api/feed?exam_tag=
export const EXAM_TAGS = [
  { key: "upsc_prelims",   label: "UPSC Prelims",  icon: "🏛️", group: "UPSC" },
  { key: "upsc_mains_gs1", label: "GS1 · History", icon: "📜", group: "UPSC" },
  { key: "upsc_mains_gs2", label: "GS2 · Polity",  icon: "⚖️", group: "UPSC" },
  { key: "upsc_mains_gs3", label: "GS3 · Economy", icon: "📊", group: "UPSC" },
  { key: "upsc_mains_gs4", label: "GS4 · Ethics",  icon: "🧭", group: "UPSC" },
  { key: "neet",           label: "NEET",           icon: "🩺", group: "Medical" },
  { key: "jee",            label: "JEE",            icon: "⚙️", group: "Engineering" },
  { key: "clat",           label: "CLAT",           icon: "📚", group: "Law" },
  { key: "gate",           label: "GATE",           icon: "🔬", group: "Engineering" },
  { key: "cat",            label: "CAT",            icon: "💼", group: "Management" },
  { key: "ssc",            label: "SSC",            icon: "📋", group: "General" },
];

export function getExamLabel(key) {
  return EXAM_TAGS.find(e => e.key === key)?.label || key;
}
export function getExamIcon(key) {
  return EXAM_TAGS.find(e => e.key === key)?.icon || "📚";
}

// Professions that should auto-show exam filter strip
export const EXAM_PROFESSIONS = new Set(["upsc", "student", "law", "medical", "technology", "finance"]);

export const INDIAN_STATES = [
  "All States", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
