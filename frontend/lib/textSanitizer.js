// frontend/lib/textSanitizer.js
// FIX: converted from CRLF to LF line endings

const NOISE_CUT_MARKERS = [
  "datalayer.push",
  "window.datalayer",
  "var datalayer",
  "'pagedetails'",
  '"pagedetails"',
  "tp.push(['init'",
  "require.config(",
  "local directory baseurl",
  "th-online/",
  "jquery-3.4.1",
  "skip to content",
];

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function cutAtFirstNoiseMarker(text) {
  const lower = text.toLowerCase();
  let cutIndex = -1;

  for (const marker of NOISE_CUT_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) {
      cutIndex = idx;
    }
  }

  return cutIndex === -1 ? text : text.slice(0, cutIndex);
}

function decodeHtmlEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity) => {
    const key = String(entity || "").toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
      ? NAMED_ENTITIES[key]
      : full;
  });
}

export function sanitizeDisplayText(value) {
  if (value == null) return "";

  // ── Unwrap summary_deep regardless of whether it arrives as object or JSON string ──
  if (typeof value === "object") {
    try {
      const parts = [];
      if (value.lead)        parts.push(value.lead);
      if (value.background)  parts.push(value.background);
      if (value.development) parts.push(value.development);
      if (value.reactions)   parts.push(value.reactions);
      if (value.impact)      parts.push(value.impact);
      value = parts.join("\n\n") || JSON.stringify(value);
    } catch {
      value = String(value);
    }
  }

  // ── If it's a JSON string (summary_deep stored as serialized object), parse it ──
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          const parts = [];
          if (parsed.lead)        parts.push(parsed.lead);
          if (parsed.background)  parts.push(parsed.background);
          if (parsed.development) parts.push(parsed.development);
          if (parsed.reactions)   parts.push(parsed.reactions);
          if (parsed.impact)      parts.push(parsed.impact);
          if (parts.length > 0) value = parts.join("\n\n");
        }
      } catch { /* not valid JSON — treat as plain text */ }
    }
  }

  // ── Strip any leftover markdown bold/italic markers ──
  value = String(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold** → plain
    .replace(/\*([^*]+)\*/g, "$1");       // *italic* → plain

  const cleaned = cutAtFirstNoiseMarker(String(value))
    .replace(/\bskip to content\b/gi, " ")
    .replace(/\bhome\s+news\s+sport\s+business\s+technology\s+health\s+culture\s+arts\s+travel\s+earth\s+audio\s+video\s+live\b/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/(?:window\.)?dataLayer\s*=\s*(?:window\.)?dataLayer\s*\|\|\s*\[\]\s*;?/gi, " ")
    .replace(/\bvar\s+dataLayer\s*=\s*(?:window\.)?dataLayer\s*\|\|\s*\[\]\s*;?/gi, " ")
    .replace(/(?:window\.)?dataLayer?\.push\s*\(\s*\{[\s\S]*?\}\s*\)\s*;?/gi, " ")
    .replace(/\btp\.push\s*\(\s*\[\s*['"]init['"][\s\S]*?\]\s*\)\s*;?/gi, " ")
    .replace(/['"]?(pageDetails|pageType|headline|articleId|articleType|authorName|publishDate|publishTime|hoursSincePublished|contentCategory|contentSubCategory|featureType)['"]?\s*[:=]\s*[^\n]+/gi, " ")
    .replace(/^\s*(WhatsApp|X\s*\(Twitter\)|LinkedIn|Telegram|Facebook|Copy\s*link|Advertisement)\s*$/gim, " ")
    .replace(/\\[nrt]/g, " ")
    .replace(/\s&\s/g, " and ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return decodeHtmlEntities(cleaned);
}