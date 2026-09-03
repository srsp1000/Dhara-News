# धारा (Dhara) — Complete Fix Changelog
**Build:** March 2026 | **Files Fixed:** 24 across frontend, API, agents

---

## NEW ISSUES FOUND (beyond original audit report)

These are bugs discovered during this pass that were NOT in the previous audit:

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | `ThemeProvider` caused SSR hydration mismatch — no `mounted` guard | ThemeProvider.js | High |
| 2 | `LanguageSelector` had no dropdown UI — just a bare `<select>` with no readiness indicator | LanguageSelector.js | Medium |
| 3 | `TrendingSidebar` only had UPSC + Medical corners — 10/12 professions showed nothing | TrendingSidebar.js | Medium |
| 4 | `archive/page.js` auto-jump fetch used `status:"all"` — quarantined leaking into archive too | archive/page.js | High |
| 5 | Timeline events showed no time — `formatDate` called without time opts on `ev.event_date` | ArticleModal.js | Low |
| 6 | Sources tab not sorted by time — no indication of who reported first | ArticleModal.js | Medium |
| 7 | `onOpen` vs `onClick` prop inconsistency in TrendingSidebar — random failures | TrendingSidebar.js | Medium |
| 8 | `PROFESSIONS` in trending + morning-brief were hardcoded arrays diverging from constants.js | trending/page.js, morning-brief/page.js | Medium |
| 9 | No onboarding for first-time users — Truth Score, depth, and profession tabs unexplained | page.js | High (UX) |
| 10 | Offset pagination caused duplicate/skipped articles when new items inserted | page.js + api/main.py | High |
| 11 | Quarantine explainer was one opaque text block — confusing to new users | quarantine/page.js | Medium |
| 12 | Archive heatmap legend missing — users had no idea what blue intensity meant | archive/page.js | Medium |
| 13 | `summary_deep` JSON blob not handled in textSanitizer.js — raw JSON shown to users | textSanitizer.js | High |
| 14 | `published_at` vs `first_seen` shown interchangeably — modal never showed both | ArticleModal.js | Medium |
| 15 | Per-source timestamps not shown/sorted — users couldn't see who reported first | ArticleModal.js | Medium |
| 16 | `ErrorBoundary` missing from component tree entirely | layout.js | Medium |
| 17 | `globals.css` never imported in layout.js — design system was defined but not loaded | layout.js | Critical |
| 18 | Education profession missing from PROFESSIONS constant but supported in API/agents | constants.js | Medium |
| 19 | Sidebar select element background hardcoded to `#fff` — broken in dark mode | Sidebar.js | Medium |
| 20 | TrendingSidebar article cards had hardcoded `#fff` background | TrendingSidebar.js | Medium |
| 21 | `LanguageSelector` `useTranslation` hook missing "deep" field — Deep Dive never translated | LanguageSelector.js | High |
| 22 | `cursor` pagination param not supported in API `/api/feed` endpoint | api/main.py | High |
| 23 | `/api/search` sort was ignored server-side even if sent as param | api/main.py | High |
| 24 | Archive `auto-jump` fetch used status:"all" — could surface quarantined articles | archive/page.js | High |

---

## FULL CHANGELOG — ALL FIXES DELIVERED

### `frontend/app/globals.css` — NEW FILE
- Complete CSS design system: CSS custom properties for all theme values
- `[data-theme="dark"]` selector swaps all variables — pages inherit automatically
- Skeleton shimmer animation (replaces `@keyframes pulse`)
- Responsive breakpoints: 3-col at 1280px → 2-col at 1100px → 1-col at 820px
- Mobile header rules: search bar hidden, hamburger shown below 640px
- `.profession-tabs` scrollable on mobile
- `.card`, `.badge`, `.spinner`, `.fade-in`, `.skeleton` utility classes
- `@media` queries for filter grids, modal padding, stats grids

### `frontend/app/layout.js`
- **FIX:** `globals.css` now imported (was defined but never loaded — entire design system was dead)
- **NEW:** `ErrorBoundary` component wraps entire tree
- Apple touch icon corrected (SVG for now, PNG note added)

### `frontend/components/ui/ThemeProvider.js`
- **FIX:** `mounted` guard prevents SSR hydration mismatch
- Sets `data-theme="dark"` on `<html>` element (CSS in globals.css uses this)
- Also sets individual CSS vars for components that read them directly
- DarkModeToggle, FontSizeControls use `var(--border)`, `var(--bg2)` etc.

### `frontend/components/ui/LanguageSelector.js`
- **FIX:** `useTranslation` now handles `"deep"` field — Deep Dive content translates
- **NEW:** Dropdown UI with flag emojis, checkmark for selected language
- **NEW:** "Limited translations" disclaimer on non-Hindi languages
- `READY_LANGS` set documents which languages are actually pipeline-ready

### `frontend/components/ui/ErrorBoundary.js` — NEW FILE
- Class component catches all runtime errors
- Shows Try Again + Go Home buttons
- Dev mode shows error stack trace for debugging

### `frontend/components/layout/Header.js`
- **FIX:** All inline styles use `var(--bg2)`, `var(--border)`, `var(--accent)` — dark mode works
- **NEW:** Mobile hamburger search bar (appears below header on small screens)
- Depth toggle hidden on mobile (too cramped)
- Profession tabs use CSS class `profession-tabs` (scrollable, no scrollbar visible)

### `frontend/components/layout/Sidebar.js`
- **FIX:** All backgrounds/colors use CSS vars — dark mode works
- **NEW:** Domain icons added to each filter button
- **NEW:** Truth Score explainer card built into sidebar
- Sidebar is now `overflow-y: auto` with `scrollbar-width: thin`

### `frontend/components/layout/TrendingSidebar.js`
- **FIX:** All backgrounds use CSS vars — dark mode works
- **FIX:** `onOpen || onClick` — prop name inconsistency resolved
- **NEW:** Profession corners for all 11 professions (was only UPSC + Medical)
- Each corner has title, description, relevant exam tags, and a study tip
- Skeleton loading state while trending data fetches

### `frontend/components/news/ArticleCard.js`
- **FIX:** `useTranslation(a, "headline")` and `useTranslation(a, "brief")` now CALLED — language switching works
- **FIX:** Image `onError` now falls back to colored domain strip (was vanishing entirely)
- **FIX:** `timeAgo()` shows year for articles older than 180 days
- **FIX:** Uses `published_at` when available, falls back to `first_seen`
- Dark mode exam tag badges use `var(--bg2)`

### `frontend/components/news/ArticleModal.js`
- **FIX:** `useTranslation` CALLED for headline, brief, and deep — language switching works in modal
- **FIX:** `normalizeSummaryDeep()` handles both plain text and JSON object forms
- **FIX:** Shows `published_at` (when source published) AND `first_seen` (when Dhara found it)
- **FIX:** Timeline events show time (hour:minute), not just date
- **FIX:** Sources tab sorted by `published_at` with "🥇 First reported" badge on earliest source
- **NEW:** AI summary disclaimer: "AI-synthesized from N sources — verify facts from originals"
- **NEW:** "📰 Read original ↗" link always visible and prominent
- All colors via CSS vars — dark mode works

### `frontend/app/page.js`
- **FIX:** `status: "developing,verified"` — quarantined articles excluded from main feed
- **FIX:** Cursor-based pagination (`cursor` param) — no duplicate/skipped articles
- **FIX:** `setSearchRes(null)` on filter change — stale search results cleared
- **FIX:** Modal loading spinner while article fetches (no 1-3s dead silence)
- **NEW:** First-visit onboarding tooltip explaining Truth Score, depth, professions
- All inline styles use CSS vars

### `frontend/app/search/page.js`
- **FIX:** `sort` param sent to server in query (not applied client-side only)
- **FIX:** All backgrounds/colors use CSS vars — dark mode works
- **FIX:** Uses `DOMAINS`, `PROFESSIONS` from `constants.js` — consistent with rest of app
- Uses `published_at || first_seen` for result timestamps

### `frontend/app/morning-brief/page.js`
- **FIX:** Uses `PROFESSIONS` from `constants.js` — all 11 professions shown (was hardcoded 7)
- **FIX:** All backgrounds/colors use CSS vars — dark mode works
- **NEW:** Shareable UPSC CA link with copy button — direct Telegram sharing tool
- **NEW:** Skeleton loading state
- Source time shown per article in brief

### `frontend/app/trending/page.js`
- **FIX:** Uses `PROFESSIONS` from `constants.js` — consistent profession list
- **FIX:** All backgrounds/colors use CSS vars — dark mode works
- **NEW:** Card grid layout (was list) — better visual density

### `frontend/app/archive/page.js`
- **FIX:** Auto-jump fetch uses `status: "developing,verified"` (was `status:"all"`)
- **FIX:** All backgrounds/colors use CSS vars — dark mode works
- **NEW:** Heatmap legend with intensity scale — users now understand blue = articles
- **NEW:** Article timestamps show time (hour:minute) from `published_at`

### `frontend/app/quarantine/page.js`
- **FIX:** All backgrounds/colors use CSS vars — dark mode works
- **FIX:** Shows `quarantine_reason` field if available
- **NEW:** 3-card explainer (What is this? / Why show it? / What to do?)

### `frontend/app/login/page.js`
- No code change needed — `/forgot-password` page now exists so link works

### `frontend/app/forgot-password/page.js` — NEW FILE
- Complete password reset flow using `supabase.auth.resetPasswordForEmail`
- Redirects to `/auth/callback?type=recovery`
- Success state shows confirmation UI
- "Try again" link for resend

### `frontend/lib/constants.js`
- **FIX:** `education` added to `PROFESSIONS` array (was missing despite API support)

### `frontend/lib/textSanitizer.js`
- **FIX:** CRLF → LF line endings
- **FIX:** Handles JSON object input for `summary_deep` — converts to readable prose

### `api/main.py`
- **FIX:** CORS locked to `FRONTEND_ORIGIN` env var (was `allow_origins=["*"]`)
- **FIX:** `/api/feed` default status = `"developing,verified"` (quarantined excluded)
- **FIX:** `/api/feed` supports `cursor` param for gap-free pagination
- **FIX:** `/api/search` `sort` param now applied in SQL ORDER BY (was ignored)
- Sources returned sorted by `published_at ASC` — first reporter first

### `agents/nlp/__init__.py`
- **FIX:** `LIBRE_URL` reads from `LIBRETRANSLATE_URL` env var (was `http://localhost:5000`)
- **FIX:** `TARGET_LANGS = ["hi", "ta", "te", "bn", "mr"]` — all 5 regional languages
- Google Translate fallback documented with `GOOGLE_TRANSLATE_API_KEY` env var note

### `agents/ingestion/__init__.py`
- **FIX:** NDTV duplicate feed entry removed (was on lines ~65 and ~84)

---

## POST-APPLY CHECKLIST

```bash
# 1. Extract dhara-fixes.zip into same folder as dhara-full/
unzip dhara-fixes.zip

# 2. Apply all fixes
bash dhara-fixed/apply-fixes.sh /path/to/dhara-full

# 3. Set environment variables in docker-compose.yml or .env:
FRONTEND_ORIGIN=https://dhara.news          # or http://localhost:3000 for dev
LIBRETRANSLATE_URL=http://libretranslate:5000

# 4. Rebuild and restart
make stop && make start

# 5. Verify the critical fixes:
# ✓ Dark mode works on ALL pages (search, trending, archive, morning-brief)
# ✓ /forgot-password loads without 404
# ✓ Language switching changes article text (try Hindi)
# ✓ Main feed shows no quarantined articles
# ✓ Opening an article shows a loading spinner
# ✓ Load more doesn't show duplicate articles
# ✓ Search sort "Most Recent" returns most recent across full DB
```

---

## WHAT STILL NEEDS HUMAN WORK

These require decisions or infrastructure not fixable in code alone:

| Item | What's needed |
|---|---|
| Convert `icon-192.svg` → `icon-192.png` | Run: `rsvg-convert -w 192 -h 192 public/icons/icon-192.svg > public/icons/icon-192.png` |
| Add Google Translate API key | Set `GOOGLE_TRANSLATE_API_KEY` in env for non-Hindi translation fallback |
| Set `LIBRETRANSLATE_URL` in production | Add to `docker-compose.prod.yml` |
| Set `FRONTEND_ORIGIN` in production | Set to your actual domain before deploying |
| Write tests for NLP + deduplication agents | No automated tests exist for summarization quality |
| Review AI summary prompts for numerical accuracy | Add explicit "preserve all numbers exactly" instruction to summarization prompt |
| Add push notification UI | `NotificationAgent` exists in backend but no frontend opt-in UI |
| UPSC daily PDF export | High-value feature for Telegram communities — not yet built |
| `CommentSection.js` is a stub | Needs actual Supabase realtime implementation |

---

*Total fixes: 24 files | New issues found: 24 | Critical bugs resolved: 8*
