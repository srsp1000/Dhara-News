-- ============================================================
-- Dhara News Platform — Complete PostgreSQL Schema
-- Works locally AND on Supabase (same schema)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── SOURCES ──────────────────────────────────────────────────────────────────
CREATE TABLE sources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain      TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  tier        INT NOT NULL DEFAULT 3 CHECK (tier BETWEEN 1 AND 4),
  cred_score  FLOAT NOT NULL DEFAULT 0.5 CHECK (cred_score BETWEEN 0 AND 1),
  crawl_type  TEXT NOT NULL DEFAULT 'rss' CHECK (crawl_type IN ('rss', 'html')),
  feed_url    TEXT,
  language    TEXT DEFAULT 'en',
  country     TEXT DEFAULT 'IN',
  category    TEXT,
  active      BOOLEAN DEFAULT TRUE,
  accuracy_history FLOAT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sources (domain, name, tier, cred_score, feed_url, category) VALUES
  ('pib.gov.in',              'PIB India',              1, 1.00, 'https://pib.gov.in/RssMain.aspx',                                    'government'),
  ('rajyasabha.nic.in',       'Rajya Sabha',            1, 1.00, NULL,                                                                  'government'),
  ('loksabha.nic.in',         'Lok Sabha',              1, 1.00, NULL,                                                                  'government'),
  ('rbi.org.in',              'RBI',                    1, 1.00, NULL,                                                                  'government'),
  ('isro.gov.in',             'ISRO',                   1, 1.00, NULL,                                                                  'government'),
  ('moef.gov.in',             'MoEFCC',                 1, 1.00, NULL,                                                                  'government'),
  ('mhrd.gov.in',             'Ministry of Education',  1, 1.00, NULL,                                                                  'government'),
  ('reuters.com',             'Reuters',                1, 1.00, 'https://feeds.reuters.com/reuters/INtopNews',                          'wire'),
  ('apnews.com',              'AP News',                1, 0.98, 'https://rsshub.app/apnews/topics/india',                              'wire'),
  ('bbc.com',                 'BBC India',              1, 0.95, 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml',              'international'),
  ('thehindu.com',            'The Hindu',              2, 0.90, 'https://www.thehindu.com/feeder/default.rss',                         'national'),
  ('indianexpress.com',       'Indian Express',         2, 0.88, 'https://indianexpress.com/feed/',                                     'national'),
  ('livemint.com',            'Mint',                   2, 0.85, 'https://www.livemint.com/rss/news',                                   'business'),
  ('economictimes.com',       'Economic Times',         2, 0.84, 'https://economictimes.indiatimes.com/rssfeedstopstories.cms',         'business'),
  ('ndtv.com',                'NDTV',                   2, 0.82, 'https://feeds.feedburner.com/ndtvnews-top-stories',                   'national'),
  ('hindustantimes.com',      'Hindustan Times',        2, 0.80, 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',     'national'),
  ('thewire.in',              'The Wire',               2, 0.75, 'https://thewire.in/feed',                                            'national'),
  ('scroll.in',               'Scroll',                 2, 0.76, 'https://scroll.in/feed',                                             'national'),
  ('timesofindia.com',        'Times of India',         2, 0.78, 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',          'national'),
  ('downtoearth.org.in',      'Down To Earth',          2, 0.88, 'https://www.downtoearth.org.in/rss',                                  'environment'),
  ('techcrunch.com',          'TechCrunch',             2, 0.82, 'https://techcrunch.com/feed/',                                        'technology'),
  ('inc42.com',               'Inc42',                  2, 0.80, 'https://inc42.com/feed/',                                            'startups'),
  ('yourstory.com',           'YourStory',              2, 0.75, 'https://yourstory.com/feed',                                          'startups'),
  ('entrackr.com',            'Entrackr',               2, 0.78, NULL,                                                                  'startups'),
  ('cricbuzz.com',            'Cricbuzz',               2, 0.85, NULL,                                                                  'sports'),
  ('espncricinfo.com',        'ESPNcricinfo',           2, 0.88, NULL,                                                                  'sports'),
  ('livelaw.in',              'LiveLaw',                2, 0.85, 'https://www.livelaw.in/rss',                                          'law'),
  ('barandbench.com',         'Bar & Bench',            2, 0.82, 'https://barandbench.com/feed',                                        'law'),
  ('republic.tv',             'Republic TV',            3, 0.55, NULL,                                                                  'national'),
  ('zeenews.india.com',       'Zee News',               3, 0.60, NULL,                                                                  'national'),
  ('opindia.com',             'OpIndia',                3, 0.45, NULL,                                                                  'national'),
  ('theonion.com',            'The Onion (SATIRE)',      4, 0.00, NULL,                                                                  'satire'),
  ('fakingnews.com',          'Faking News (SATIRE)',    4, 0.00, NULL,                                                                  'satire')
ON CONFLICT (domain) DO NOTHING;

-- ── STORY CLUSTERS ───────────────────────────────────────────────────────────
CREATE TABLE story_clusters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  headline        TEXT NOT NULL DEFAULT '',
  summary_brief   TEXT,
  summary_deep    TEXT,
  platform_body   TEXT,
  truth_score     INT NOT NULL DEFAULT 0 CHECK (truth_score BETWEEN 0 AND 100),
  source_count    INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'developing'
                  CHECK (status IN ('developing','verified','quarantine','satire')),
  conflict        BOOLEAN DEFAULT FALSE,
  conflict_reason TEXT,
  conflict_type   VARCHAR(20) DEFAULT 'none',
  first_seen      TIMESTAMPTZ DEFAULT NOW(),
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  -- Taxonomy
  domain          TEXT DEFAULT 'general',
  domains_all     TEXT[] DEFAULT '{}',
  -- Personalization
  professions     TEXT[] DEFAULT '{}',
  exam_tags       TEXT[] DEFAULT '{}',
  -- Location
  loc_global      BOOLEAN DEFAULT FALSE,
  loc_country     TEXT DEFAULT 'IN',
  loc_state       TEXT,
  loc_city        TEXT,
  -- Bias
  bias_score      FLOAT,
  -- Full-text search
  search_vec      TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(headline,'') || ' ' ||
      COALESCE(summary_brief,'') || ' ' ||
      COALESCE(summary_deep,'')
    )
  ) STORED
);

CREATE INDEX idx_clusters_status      ON story_clusters(status);
CREATE INDEX idx_clusters_domain      ON story_clusters(domain);
CREATE INDEX idx_clusters_country     ON story_clusters(loc_country);
CREATE INDEX idx_clusters_state       ON story_clusters(loc_state);
CREATE INDEX idx_clusters_first_seen  ON story_clusters(first_seen DESC);
CREATE INDEX idx_clusters_truth       ON story_clusters(truth_score DESC);
CREATE INDEX idx_clusters_updated     ON story_clusters(last_updated DESC);
CREATE INDEX idx_clusters_search      ON story_clusters USING GIN(search_vec);
CREATE INDEX idx_clusters_profs       ON story_clusters USING GIN(professions);
CREATE INDEX idx_clusters_exams       ON story_clusters USING GIN(exam_tags);

-- ── ARTICLES ─────────────────────────────────────────────────────────────────
CREATE TABLE articles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id      UUID REFERENCES story_clusters(id) ON DELETE SET NULL,
  source_domain   TEXT NOT NULL,
  original_url    TEXT UNIQUE NOT NULL,
  original_title  TEXT NOT NULL DEFAULT '',
  original_body   TEXT,
  published_at    TIMESTAMPTZ,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  fingerprint     TEXT,
  language        TEXT DEFAULT 'en',
  image_url       TEXT,
  image_phash     TEXT,
  author          TEXT,
  source_tier     INT DEFAULT 3,
  source_cred     FLOAT DEFAULT 0.5,
  fake_score      INT DEFAULT 0,
  is_satire       BOOLEAN DEFAULT FALSE,
  processed       BOOLEAN DEFAULT FALSE
);

CREATE UNIQUE INDEX idx_articles_fingerprint ON articles(fingerprint)
  WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_articles_cluster    ON articles(cluster_id);
CREATE INDEX idx_articles_published  ON articles(published_at DESC);
CREATE INDEX idx_articles_domain     ON articles(source_domain);

-- ── CLAIMS ───────────────────────────────────────────────────────────────────
CREATE TABLE claims (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id      UUID REFERENCES articles(id) ON DELETE CASCADE,
  cluster_id      UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  claim_text      TEXT NOT NULL,
  subject         TEXT,
  claim_type      TEXT,
  source_tier     INT DEFAULT 3,
  source_cred     FLOAT DEFAULT 0.5,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_claims_cluster ON claims(cluster_id);
CREATE INDEX idx_claims_created ON claims(created_at DESC);

-- ── STORY EVENTS (timeline) ──────────────────────────────────────────────────
CREATE TABLE story_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id      UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  event_text      TEXT NOT NULL,
  event_date      TIMESTAMPTZ NOT NULL,
  source_name     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_cluster ON story_events(cluster_id, event_date DESC);

-- ── ARTICLE TRANSLATIONS ─────────────────────────────────────────────────────
CREATE TABLE article_translations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,
  headline    TEXT NOT NULL,
  summary     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cluster_id, language)
);

-- ── ARTICLE SEO ───────────────────────────────────────────────────────────────
CREATE TABLE article_seo (
  cluster_id        UUID PRIMARY KEY REFERENCES story_clusters(id) ON DELETE CASCADE,
  meta_title        TEXT,
  meta_description  TEXT,
  keywords          TEXT,
  schema_json       JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── TERMINOLOGY ──────────────────────────────────────────────────────────────
CREATE TABLE terminology (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  term        TEXT NOT NULL,
  profession  TEXT NOT NULL,
  explanation TEXT NOT NULL,
  context     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(term, profession)
);

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE user_profiles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT UNIQUE,
  profession   TEXT NOT NULL DEFAULT 'general',
  loc_country  TEXT DEFAULT 'IN',
  loc_state    TEXT,
  loc_city     TEXT,
  language     TEXT DEFAULT 'en',
  exam_name    TEXT,
  exam_date    DATE,
  depth_prefs  JSONB DEFAULT '{}',
  is_pro       BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── SAVED ARTICLES ───────────────────────────────────────────────────────────
CREATE TABLE saved_articles (
  user_id     UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ DEFAULT NOW(),
  notes       TEXT,
  PRIMARY KEY (user_id, cluster_id)
);

-- ── ARTICLE VIEWS (for trending — no user PII) ───────────────────────────────
CREATE TABLE article_views (
  id          BIGSERIAL PRIMARY KEY,
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  profession  TEXT,
  loc_country TEXT DEFAULT 'IN',
  loc_state   TEXT,
  viewed_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_views_cluster ON article_views(cluster_id, viewed_at DESC);
CREATE INDEX idx_views_time    ON article_views(viewed_at DESC);
-- Auto-delete views older than 7 days (keep DB lean)
-- In production: use pg_cron to run: DELETE FROM article_views WHERE viewed_at < NOW() - INTERVAL '7 days';

-- ── BIAS REPORTS ─────────────────────────────────────────────────────────────
CREATE TABLE bias_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start  DATE NOT NULL UNIQUE,
  total_articles INT,
  avg_bias    FLOAT,
  domain_breakdown JSONB,
  alert_triggered BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── USEFUL VIEWS ─────────────────────────────────────────────────────────────

CREATE VIEW feed_verified AS
  SELECT c.*,
         COALESCE(v.views_24h, 0) AS views_24h
  FROM story_clusters c
  LEFT JOIN (
    SELECT cluster_id, COUNT(*) AS views_24h
    FROM article_views
    WHERE viewed_at > NOW() - INTERVAL '24 hours'
    GROUP BY cluster_id
  ) v ON v.cluster_id = c.id
  WHERE c.status = 'verified'
  ORDER BY c.first_seen DESC;

CREATE VIEW feed_trending_now AS
  SELECT c.*,
         v.views_1h
  FROM story_clusters c
  JOIN (
    SELECT cluster_id, COUNT(*) AS views_1h
    FROM article_views
    WHERE viewed_at > NOW() - INTERVAL '1 hour'
    GROUP BY cluster_id
    HAVING COUNT(*) > 3
  ) v ON v.cluster_id = c.id
  WHERE c.status = 'verified'
  ORDER BY v.views_1h DESC;

-- ── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

-- Full-text search with filters
CREATE OR REPLACE FUNCTION search_articles(
  q TEXT,
  p_domain TEXT DEFAULT NULL,
  p_profession TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_exam TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS SETOF story_clusters
LANGUAGE sql STABLE AS $$
  SELECT * FROM story_clusters
  WHERE search_vec @@ plainto_tsquery('english', q)
    AND status = 'verified'
    AND (p_domain IS NULL OR domain = p_domain)
    AND (p_profession IS NULL OR p_profession = ANY(professions))
    AND (p_state IS NULL OR loc_state = p_state)
    AND (p_exam IS NULL OR p_exam = ANY(exam_tags))
    AND (p_date_from IS NULL OR first_seen >= p_date_from)
    AND (p_date_to IS NULL OR first_seen <= p_date_to)
  ORDER BY ts_rank(search_vec, plainto_tsquery('english', q)) DESC,
           truth_score DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Calendar heatmap
CREATE OR REPLACE FUNCTION get_monthly_heatmap(year_num INT, month_num INT)
RETURNS TABLE(day_date DATE, article_count BIGINT)
LANGUAGE sql AS $$
  SELECT DATE_TRUNC('day', first_seen)::DATE AS day_date, COUNT(*) AS article_count
  FROM story_clusters
  WHERE EXTRACT(YEAR FROM first_seen) = year_num
    AND EXTRACT(MONTH FROM first_seen) = month_num
    AND status = 'verified'
  GROUP BY day_date
  ORDER BY day_date;
$$;

-- Find matching cluster for dedup
CREATE OR REPLACE FUNCTION find_matching_cluster(
  search_query TEXT,
  domain_filter TEXT,
  hours_back INT DEFAULT 48
) RETURNS TABLE(id UUID, headline TEXT, truth_score INT)
LANGUAGE sql AS $$
  SELECT id, headline, truth_score
  FROM story_clusters
  WHERE search_vec @@ plainto_tsquery('english', search_query)
    AND (domain_filter IS NULL OR domain = domain_filter)
    AND first_seen > NOW() - (hours_back || ' hours')::INTERVAL
  ORDER BY ts_rank(search_vec, plainto_tsquery('english', search_query)) DESC
  LIMIT 1;
$$;

-- ── COMMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  is_verified BOOLEAN DEFAULT FALSE,
  is_hidden   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_cluster ON comments(cluster_id, created_at DESC);

-- ── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL,
  payment_id    TEXT,
  status        TEXT DEFAULT 'active',
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

-- ── ADD MISSING COLUMNS ───────────────────────────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE sources       ADD COLUMN IF NOT EXISTS bias_score FLOAT DEFAULT 0.0;

-- Update bias scores for known sources
UPDATE sources SET bias_score = -0.25 WHERE domain IN ('thewire.in','scroll.in','ndtv.com');
UPDATE sources SET bias_score =  0.55 WHERE domain IN ('republic.tv','opindia.com');
UPDATE sources SET bias_score =  0.00 WHERE domain IN ('reuters.com','bbc.com','apnews.com','pib.gov.in');
UPDATE sources SET bias_score = -0.15 WHERE domain IN ('thehindu.com','indianexpress.com');
UPDATE sources SET bias_score =  0.10 WHERE domain IN ('economictimes.com','timesofindia.com');

-- ── PERFORMANCE INDEXES (Fix #10) ─────────────────────────────────────────────
-- Composite indexes for the main feed query:
--   WHERE status='verified' AND domain=? AND professions @> ?  ORDER BY first_seen DESC
-- Without these, PostgreSQL falls back to a full table scan at >10k articles.

CREATE INDEX IF NOT EXISTS idx_clusters_feed_main
  ON story_clusters(status, first_seen DESC)
  WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS idx_clusters_domain_seen
  ON story_clusters(domain, first_seen DESC)
  WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS idx_clusters_status_domain_seen
  ON story_clusters(status, domain, first_seen DESC);
-- infra/schema_additions.sql
-- Applies all schema changes needed for the production fixes in this session.
-- Safe to run on an existing database — all statements are idempotent.
-- Run: psql $DATABASE_URL -f infra/schema_additions.sql

-- ── 1. user_profiles — add preference columns for server-side settings sync ──
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS exam_name      TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS exam_tag       TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS default_state  TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS reading_depth  TEXT DEFAULT 'brief';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_digest   BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS digest_time    TEXT DEFAULT '07:00';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notifications  BOOLEAN DEFAULT TRUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS premium_until  TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- ── 2. story_clusters — add columns for contradiction reason ─────────────────
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS conflict_reason TEXT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS conflict_type   VARCHAR(20) DEFAULT 'none';
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS ad_blocked       BOOLEAN DEFAULT FALSE;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS source_tier      INTEGER DEFAULT 2;

-- ── 3. user_subscriptions table (needed by Razorpay webhook handler) ─────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL DEFAULT 'pro',
  status          TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | expired
  billing_cycle   TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly
  amount_inr      INTEGER,
  payment_ref     TEXT,
  razorpay_sub_id TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  UNIQUE (user_id)  -- one active subscription per user
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires
  ON user_subscriptions (expires_at)
  WHERE status = 'active';

-- ── 4. comments — ensure correct schema ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  is_verified BOOLEAN DEFAULT FALSE,
  is_hidden   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_cluster
  ON comments (cluster_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_user
  ON comments (user_id, created_at DESC);

-- ── 5. article_annotations — ensure all columns exist ────────────────────────
CREATE TABLE IF NOT EXISTS article_annotations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  cluster_id    UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  start_char    INTEGER NOT NULL,
  end_char      INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  note          TEXT,
  tag           TEXT,    -- 'gs1' | 'gs2' | 'gs3' | 'gs4' | 'highlight' | 'question'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_user_cluster
  ON article_annotations (user_id, cluster_id);

-- ── 6a. article_images — ensure multi-image support table exists ─────────────
CREATE TABLE IF NOT EXISTS article_images (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  caption    TEXT,
  alt_text   TEXT,
  position   INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_images_cluster
  ON article_images (cluster_id, position);

-- ── 6. flashcard_progress — ensure exists with correct schema ────────────────
CREATE TABLE IF NOT EXISTS flashcard_progress (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  cluster_id    UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  ease_factor   FLOAT NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 1,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  due_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_quality  INTEGER,   -- 0-5 (SM-2 quality rating)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, cluster_id)
);

-- NOTE: partial-index predicates must be immutable in PostgreSQL.
-- Using NOW() here raises "functions in index predicate must be marked IMMUTABLE".
CREATE INDEX IF NOT EXISTS idx_flashcard_due
  ON flashcard_progress (user_id, due_date);

-- ── 7. user_streaks — streak tracking for flashcard daily practice ────────────
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id         UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_activity   DATE,
  total_reviews   INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Indexes for comments and annotation queries ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clusters_source_tier
  ON story_clusters (source_tier, status, first_seen DESC);

-- ── 8b. Hot endpoint index coverage (feed/trending/detail) ───────────────────
CREATE INDEX IF NOT EXISTS idx_clusters_feed_verified_latest
  ON story_clusters (first_seen DESC, truth_score DESC, source_count DESC)
  WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS idx_clusters_feed_verified_rank
  ON story_clusters (truth_score DESC, source_count DESC, first_seen DESC)
  WHERE status = 'verified';

CREATE INDEX IF NOT EXISTS idx_views_prof_state_time_cluster
  ON article_views (profession, loc_state, viewed_at DESC, cluster_id);

CREATE INDEX IF NOT EXISTS idx_views_prof_time_cluster
  ON article_views (profession, viewed_at DESC, cluster_id);

CREATE INDEX IF NOT EXISTS idx_articles_cluster_published
  ON articles (cluster_id, published_at);

-- ── 8c. Webhook replay protection receipts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_event_receipts (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_receipts_received_at
  ON webhook_event_receipts (received_at DESC);

-- ── 9. Trigger: auto-update updated_at on user_profiles ──────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ============================================================
-- Dhara News — Schema Migration v2
-- Adds columns referenced by the updated frontend/API but
-- missing from the base schema.sql
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)
-- ============================================================

-- 1. story_clusters: add image_url (frontend renders article images)
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. story_clusters: add published_at (distinct from first_seen)
--    Populated by ingestion agents from RSS <pubDate>
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 3. story_clusters: add quarantine_reason (shown in quarantine page)
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;

-- 4. story_clusters: add view_count (trending calculation)
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;

-- 5. article_translations: ensure 'deep' column exists
--    (frontend useTranslation hook reads t.deep for Deep Dive)
ALTER TABLE article_translations
  ADD COLUMN IF NOT EXISTS deep TEXT;

-- 6. articles: add published_at if missing
--    (sources tab shows per-source timestamps)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 7. articles: add bias_score column
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS bias_score FLOAT DEFAULT 0;

-- 8. story_clusters: update status check to include 'quarantined' spelling variant
--    Original schema uses 'quarantine'; API quarantine endpoint uses 'quarantine'
--    Frontend uses 'quarantined' in some places — standardise on 'quarantine'
--    (no column change needed — just a note for consistency)

-- 9. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_clusters_published
  ON story_clusters(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_clusters_views
  ON story_clusters(view_count DESC);

-- 10. Backfill: set published_at from first_seen where null
UPDATE story_clusters
  SET published_at = first_seen
  WHERE published_at IS NULL AND first_seen IS NOT NULL;

UPDATE articles
  SET published_at = fetched_at
  WHERE published_at IS NULL AND fetched_at IS NOT NULL;

-- Done
SELECT 'Migration v2 complete' AS status;

-- 10. Push notification subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint          TEXT PRIMARY KEY,
    subscription_json TEXT NOT NULL,
    user_id           UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    profession        TEXT DEFAULT 'general',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_profession ON push_subscriptions(profession);

-- 11. Fact-check request queue from users
CREATE TABLE IF NOT EXISTS factcheck_requests (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim        TEXT NOT NULL,
    user_id      UUID,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status       TEXT DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in_progress', 'published', 'rejected')),
    cluster_id   UUID REFERENCES story_clusters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_factcheck_status ON factcheck_requests(status, submitted_at DESC);

-- 12. Article images — multiple images per article
CREATE TABLE IF NOT EXISTS article_images (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id  UUID NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    caption     TEXT DEFAULT '',
    alt_text    TEXT DEFAULT '',
    position    INT  DEFAULT 0,      -- 0 = hero, 1+ = inline
    source_url  TEXT DEFAULT '',     -- where image was found
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_article_images_cluster ON article_images(cluster_id, position);

-- 13. Ad slots table
CREATE TABLE IF NOT EXISTS ad_slots (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position     TEXT NOT NULL,      -- feed_slot | sidebar | morning_brief | article_bottom
    image_url    TEXT DEFAULT '',
    link_url     TEXT NOT NULL,
    alt_text     TEXT DEFAULT '',
    profession   TEXT DEFAULT 'all',
    domain       TEXT DEFAULT 'all',
    active_from  TIMESTAMPTZ DEFAULT NOW(),
    active_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    impressions  INT DEFAULT 0,
    clicks       INT DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_slots_active ON ad_slots(position, active_from, active_until);

-- 14. Backfill article_images from existing image_url
INSERT INTO article_images (cluster_id, url, position)
SELECT id, image_url, 0
FROM story_clusters
WHERE image_url IS NOT NULL AND image_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM article_images WHERE cluster_id = story_clusters.id AND position = 0
  );

-- ─── NEW TABLES FOR ADVANCED FEATURES ────────────────────────────────────────

-- Annotations / highlights (UPSC study tool)
CREATE TABLE IF NOT EXISTS article_annotations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,
    cluster_id   UUID NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
    start_char   INT  NOT NULL,
    end_char     INT  NOT NULL,
    selected_text TEXT NOT NULL,
    note         TEXT DEFAULT '',
    tag          TEXT DEFAULT '',   -- e.g. 'GS1', 'GS2', 'NEET', 'important'
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_annotations_user ON article_annotations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_cluster ON article_annotations(cluster_id);

-- Flashcard progress / spaced repetition
CREATE TABLE IF NOT EXISTS flashcard_progress (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,
    cluster_id   UUID NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
    ease_factor  FLOAT DEFAULT 2.5,   -- SM-2 algorithm
    interval     INT   DEFAULT 1,     -- days until next review
    repetitions  INT   DEFAULT 0,
    due_date     TIMESTAMPTZ DEFAULT NOW(),
    last_quality INT   DEFAULT 0,     -- 0-5 (0=blackout, 5=perfect)
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, cluster_id)
);
CREATE INDEX IF NOT EXISTS idx_fc_due ON flashcard_progress(user_id, due_date ASC);

-- Daily streak tracking
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id      UUID PRIMARY KEY,
    current      INT  DEFAULT 0,
    longest      INT  DEFAULT 0,
    last_date    DATE DEFAULT CURRENT_DATE,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Email digest preferences
CREATE TABLE IF NOT EXISTS email_preferences (
    user_id        UUID PRIMARY KEY,
    email          TEXT NOT NULL,
    digest_enabled BOOLEAN DEFAULT TRUE,
    digest_time    TEXT DEFAULT '07:00',  -- HH:MM IST
    profession     TEXT DEFAULT 'general',
    unsubscribe_token TEXT DEFAULT gen_random_uuid()::text,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Premium subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL,
    plan           TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','team')),
    status         TEXT DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','trial')),
    billing_cycle  TEXT DEFAULT 'monthly',
    amount_inr     INT  DEFAULT 0,
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    expires_at     TIMESTAMPTZ,
    payment_ref    TEXT DEFAULT '',
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_user ON user_subscriptions(user_id, status);

-- Add premium flag to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_digest BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS digest_email TEXT DEFAULT '';

SELECT 'Migration v3 complete — annotations, flashcards, streaks, email, subscriptions' AS status;

-- ── v3: article_translations — fix column name inconsistency ─────────────────
-- The API was querying column "lang" but the schema defines "language".
-- If any deployment created the table with "lang" (from an old draft), rename it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'article_translations' AND column_name = 'lang'
    ) THEN
        ALTER TABLE article_translations RENAME COLUMN lang TO language;
        RAISE NOTICE 'Renamed article_translations.lang → language';
    END IF;
END $$;

-- Ensure UNIQUE constraint exists (needed for ON CONFLICT in translation INSERT)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'article_translations_cluster_id_language_key'
    ) THEN
        ALTER TABLE article_translations
            ADD CONSTRAINT article_translations_cluster_id_language_key
            UNIQUE (cluster_id, language);
        RAISE NOTICE 'Added UNIQUE(cluster_id, language) to article_translations';
    END IF;
END $$;
-- infra/schema_bayesian.sql
-- Additions for: Bayesian verification engine, breaking news, admin controls
-- All statements idempotent — safe to run on existing DB.

-- ── 1. story_clusters — breaking news + Bayesian probability columns ─────────
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS is_breaking       BOOLEAN DEFAULT FALSE;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS breaking_at       TIMESTAMPTZ;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS article_probability FLOAT;  -- P(truth) 0-1
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS article_uncertainty FLOAT;  -- uncertainty width
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS n_eff             FLOAT;    -- effective sources
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS label_reason      TEXT;     -- why this label
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS loc_district      TEXT;

-- ── 2. sources — ownership/syndication chain ─────────────────────────────────
ALTER TABLE sources ADD COLUMN IF NOT EXISTS ownership_chain TEXT;   -- e.g. "times_of_india_group"
ALTER TABLE sources ADD COLUMN IF NOT EXISTS wire_source     TEXT;   -- e.g. "pti", "ani", "reuters"
ALTER TABLE sources ADD COLUMN IF NOT EXISTS correction_rate FLOAT DEFAULT 0.0;  -- % of articles corrected
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_accuracy_update TIMESTAMPTZ;

-- ── 3. claims — add confidence and Bayesian fields ───────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_confidence FLOAT DEFAULT 0.7;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_probability FLOAT;  -- P(claim is true)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_uncertainty FLOAT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS evidence_count    INTEGER DEFAULT 0;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS contradicts_claim BOOLEAN DEFAULT FALSE;

-- ── 4. source_reliability_history — for θ(s,d,t) persistence ────────────────
CREATE TABLE IF NOT EXISTS source_reliability_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_domain TEXT NOT NULL,
    topic_domain  TEXT NOT NULL DEFAULT 'national',
    prior_value   FLOAT NOT NULL,
    event_type    TEXT NOT NULL,  -- 'correction' | 'confirmation' | 'decay'
    cluster_id    UUID REFERENCES story_clusters(id) ON DELETE SET NULL,
    recorded_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_src_reliability_domain
    ON source_reliability_history (source_domain, topic_domain, recorded_at DESC);

-- ── 5. admin_config — live tunable parameters ────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  TEXT DEFAULT 'system'
);

INSERT INTO admin_config (key, value, description) VALUES
    ('p_verified_default',      '0.85', 'Bayesian P(truth) threshold for Verified label'),
    ('p_verified_high_stakes',  '0.90', 'P(truth) threshold for health/judiciary/defence/security'),
    ('n_eff_verified_default',  '2.0',  'Min effective independent sources for Verified'),
    ('n_eff_high_stakes',       '3.0',  'Min N_eff for high-stakes domains'),
    ('single_source_exception_min_p', '0.95', 'P(truth) floor for official single-source verification exception'),
    ('breaking_velocity_mult',  '3.0',  'Breaking news: velocity multiplier threshold (3x baseline)'),
    ('breaking_min_score',      '85',   'Breaking news: minimum truth_score'),
    ('breaking_min_sources',    '2',    'Breaking news: minimum source_count'),
    ('breaking_ttl_hours',      '4',    'Breaking news: hours before label expires'),
    ('trending_window_hours',   '24',   'Trending: time window for view counting'),
    ('trending_velocity_weight','3.0',  'Trending: multiplier for last-1h views'),
    ('feed_cache_ttl_secs',     '900',  'Feed cache TTL in seconds'),
    ('max_quarantine_age_days', '7',    'Delete quarantined articles older than N days')
ON CONFLICT (key) DO NOTHING;

-- ── 6. breaking news index ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clusters_breaking
    ON story_clusters (is_breaking, breaking_at DESC)
    WHERE is_breaking = TRUE;

CREATE INDEX IF NOT EXISTS idx_clusters_probability
    ON story_clusters (article_probability DESC)
    WHERE article_probability IS NOT NULL;

-- ── 7. pipeline_events — admin audit log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type  TEXT NOT NULL,   -- 'promote' | 'quarantine' | 'delete' | 'breaking_set' | 'source_pause'
    cluster_id  UUID REFERENCES story_clusters(id) ON DELETE SET NULL,
    actor       TEXT NOT NULL DEFAULT 'system',
    old_value   TEXT,
    new_value   TEXT,
    reason      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_type
    ON pipeline_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_cluster
    ON pipeline_events (cluster_id, created_at DESC);
-- ============================================================
-- Dhara News — Master Schema Fix (idempotent, run after schema.sql)
-- Consolidates: schema_additions.sql + schema_bayesian.sql + migration_v2.sql
-- Safe to run on both fresh and existing databases.
-- ============================================================

-- Extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── 1. story_clusters: all missing columns ────────────────────────────────────
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS conflict_reason      TEXT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS conflict_type        VARCHAR(20) DEFAULT 'none';
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS is_breaking          BOOLEAN DEFAULT FALSE;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS breaking_at          TIMESTAMPTZ;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS article_probability  FLOAT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS article_uncertainty  FLOAT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS n_eff                FLOAT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS label_reason         TEXT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS loc_district         TEXT;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS ad_blocked           BOOLEAN DEFAULT FALSE;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS source_tier          INTEGER DEFAULT 2;
ALTER TABLE story_clusters ADD COLUMN IF NOT EXISTS image_url            TEXT;

-- ── 2. user_profiles: all missing columns ────────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_pro          BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_premium      BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS premium_until   TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS disabled        BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS exam_name       TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS exam_tag        TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS default_state   TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS reading_depth   TEXT DEFAULT 'brief';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_digest    BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS digest_email    TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS digest_time     TEXT DEFAULT '07:00';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notifications   BOOLEAN DEFAULT TRUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fcm_token       TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name       TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url      TEXT;

-- ── 3. sources: all missing columns ──────────────────────────────────────────
ALTER TABLE sources ADD COLUMN IF NOT EXISTS bias_score           FLOAT DEFAULT 0.0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS crawl_type           TEXT DEFAULT 'rss';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS ownership_chain      TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS wire_source          TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS correction_rate      FLOAT DEFAULT 0.0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_accuracy_update TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS accuracy_history     FLOAT[] DEFAULT '{}';

-- ── 4. claims: Bayesian fields ────────────────────────────────────────────────
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_confidence   FLOAT DEFAULT 0.7;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_probability  FLOAT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_uncertainty  FLOAT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS evidence_count     INTEGER DEFAULT 0;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS contradicts_claim  BOOLEAN DEFAULT FALSE;

-- ── 5. Bias scores for major sources ─────────────────────────────────────────
UPDATE sources SET bias_score = -0.25 WHERE domain IN ('thewire.in','scroll.in','ndtv.com');
UPDATE sources SET bias_score =  0.55 WHERE domain IN ('republic.tv','opindia.com');
UPDATE sources SET bias_score =  0.00 WHERE domain IN ('reuters.com','bbc.com','apnews.com','pib.gov.in');
UPDATE sources SET bias_score = -0.15 WHERE domain IN ('thehindu.com','indianexpress.com');
UPDATE sources SET bias_score =  0.10 WHERE domain IN ('economictimes.com','timesofindia.com');

-- ── 6. article_images table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_images (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  caption    TEXT,
  alt_text   TEXT,
  position   INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_article_images_cluster ON article_images(cluster_id, position);

-- ── 7. article_annotations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_annotations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  cluster_id    UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  start_char    INTEGER NOT NULL,
  end_char      INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  note          TEXT,
  tag           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_annotations_user_cluster ON article_annotations(user_id, cluster_id);

-- ── 8. comments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  is_verified BOOLEAN DEFAULT FALSE,
  is_hidden   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_cluster ON comments(cluster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user    ON comments(user_id, created_at DESC);

-- ── 9. flashcard_progress (interval_days — NOT reserved word 'interval') ──────
CREATE TABLE IF NOT EXISTS flashcard_progress (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  cluster_id   UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  ease_factor  FLOAT NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 1,
  repetitions  INTEGER NOT NULL DEFAULT 0,
  due_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_quality INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, cluster_id)
);
CREATE INDEX IF NOT EXISTS idx_flashcard_due ON flashcard_progress(user_id, due_date);

-- ── 10. user_streaks (correct column names) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id         UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_activity   DATE,
  total_reviews   INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. user_subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL DEFAULT 'pro',
  status          TEXT NOT NULL DEFAULT 'active',
  billing_cycle   TEXT NOT NULL DEFAULT 'monthly',
  amount_inr      INTEGER,
  payment_ref     TEXT,
  razorpay_sub_id TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires
  ON user_subscriptions(expires_at) WHERE status = 'active';

-- ── 12. email_preferences ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_preferences (
  user_id          UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  profession       TEXT DEFAULT 'general',
  digest_time      TEXT DEFAULT '07:00',
  digest_enabled   BOOLEAN DEFAULT TRUE,
  unsubscribe_token TEXT UNIQUE DEFAULT md5(random()::TEXT)
);

-- ── 13. push_subscriptions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint          TEXT PRIMARY KEY,
  subscription_json JSONB NOT NULL,
  user_id           UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  profession        TEXT DEFAULT 'general',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 14. webhook_event_receipts (replay protection) ───────────────────────────
CREATE TABLE IF NOT EXISTS webhook_event_receipts (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);

-- ── 15. admin_config ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT DEFAULT 'system'
);
INSERT INTO admin_config (key, value, description) VALUES
  ('p_verified_default',           '0.85', 'Bayesian P(truth) threshold for Verified label'),
  ('p_verified_high_stakes',       '0.90', 'P(truth) threshold for health/judiciary/defence/security'),
  ('n_eff_verified_default',       '2.0',  'Min effective independent sources for Verified'),
  ('n_eff_high_stakes',            '3.0',  'Min N_eff for high-stakes domains'),
  ('single_source_exception_min_p','0.95', 'P(truth) floor for official single-source exception'),
  ('breaking_velocity_mult',       '3.0',  'Breaking: velocity multiplier threshold'),
  ('breaking_min_score',           '85',   'Breaking: minimum truth_score'),
  ('breaking_min_sources',         '2',    'Breaking: minimum source_count'),
  ('breaking_ttl_hours',           '4',    'Breaking: hours before label expires'),
  ('trending_window_hours',        '24',   'Trending: time window for view counting'),
  ('trending_velocity_weight',     '3.0',  'Trending: multiplier for last-1h views'),
  ('feed_cache_ttl_secs',          '900',  'Feed cache TTL in seconds'),
  ('max_quarantine_age_days',      '7',    'Delete quarantined articles older than N days')
ON CONFLICT (key) DO NOTHING;

-- ── 16. pipeline_events (admin audit log) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type  TEXT NOT NULL,
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE SET NULL,
  actor       TEXT NOT NULL DEFAULT 'system',
  old_value   TEXT,
  new_value   TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_type    ON pipeline_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_cluster ON pipeline_events(cluster_id, created_at DESC);

-- ── 17. source_reliability_history ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_reliability_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_domain TEXT NOT NULL,
  topic_domain  TEXT NOT NULL DEFAULT 'national',
  prior_value   FLOAT NOT NULL,
  event_type    TEXT NOT NULL,
  cluster_id    UUID REFERENCES story_clusters(id) ON DELETE SET NULL,
  recorded_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_src_reliability_domain
  ON source_reliability_history(source_domain, topic_domain, recorded_at DESC);

-- ── 18. factcheck_requests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factcheck_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim        TEXT NOT NULL,
  user_id      UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  cluster_id   UUID REFERENCES story_clusters(id) ON DELETE SET NULL,
  status       TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 19. bias_reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bias_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start      DATE NOT NULL,
  avg_bias        FLOAT,
  alert_triggered BOOLEAN DEFAULT FALSE,
  report_json     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 20. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clusters_breaking
  ON story_clusters(is_breaking, breaking_at DESC) WHERE is_breaking = TRUE;
CREATE INDEX IF NOT EXISTS idx_clusters_probability
  ON story_clusters(article_probability DESC) WHERE article_probability IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clusters_feed_verified_latest
  ON story_clusters(first_seen DESC, truth_score DESC, source_count DESC) WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS idx_clusters_feed_verified_rank
  ON story_clusters(truth_score DESC, source_count DESC, first_seen DESC) WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS idx_views_prof_state_time_cluster
  ON article_views(profession, loc_state, viewed_at DESC, cluster_id);
CREATE INDEX IF NOT EXISTS idx_views_prof_time_cluster
  ON article_views(profession, viewed_at DESC, cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_cluster_published
  ON articles(cluster_id, published_at);
CREATE INDEX IF NOT EXISTS idx_clusters_source_tier
  ON story_clusters(source_tier, status, first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_loc_district
  ON story_clusters(loc_district) WHERE loc_district IS NOT NULL;

-- ── 21. Update heatmap function to include developing articles ────────────────
CREATE OR REPLACE FUNCTION get_monthly_heatmap(year_num INT, month_num INT)
RETURNS TABLE(day_date DATE, article_count BIGINT)
LANGUAGE sql AS $$
  SELECT DATE_TRUNC('day', first_seen AT TIME ZONE 'Asia/Kolkata')::DATE AS day_date,
         COUNT(*) AS article_count
  FROM story_clusters
  WHERE EXTRACT(YEAR FROM first_seen AT TIME ZONE 'Asia/Kolkata') = year_num
    AND EXTRACT(MONTH FROM first_seen AT TIME ZONE 'Asia/Kolkata') = month_num
    AND status IN ('verified', 'developing')
    AND headline IS NOT NULL AND BTRIM(headline) <> ''
  GROUP BY day_date
  ORDER BY day_date;
$$;

-- migrations/001_dhara_audit_fixes.sql
--
-- Applies all schema changes required by the audit fixes.
-- Run with: psql $DATABASE_URL -f migrations/001_dhara_audit_fixes.sql
--
-- Safe to re-run: every statement uses IF NOT EXISTS / DO NOTHING guards.
-- ─────────────────────────────────────────────────────────────────────────────

-- FIX #12 ContradictionDetector: store the reason and type when conflict=true
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS conflict_reason TEXT,
  ADD COLUMN IF NOT EXISTS conflict_type   VARCHAR(20) DEFAULT 'none';

-- FIX #4 (AdQuality): ad_blocked column for direct feed API exposure
-- The Redis per-cluster key is the live source; this column is for audit/history.
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS ad_blocked BOOLEAN DEFAULT FALSE;

-- FIX #13 (BiasDrift): proper bias_score column for future use
-- Currently NULL — will be populated once a bias-scoring agent is wired in.
ALTER TABLE story_clusters
  ADD COLUMN IF NOT EXISTS bias_score FLOAT;

-- INDEX: exam_tag filtering on /api/feed?exam_tag=upsc_prelims
-- story_clusters.exam_tags is a TEXT[] column; GIN index enables @> queries.
CREATE INDEX IF NOT EXISTS idx_story_clusters_exam_tags
  ON story_clusters USING GIN (exam_tags);

-- INDEX: location + domain feed queries (most common API filter combo)
CREATE INDEX IF NOT EXISTS idx_story_clusters_state_domain
  ON story_clusters (loc_state, domain, status, truth_score DESC);

-- INDEX: profession feed queries
CREATE INDEX IF NOT EXISTS idx_story_clusters_professions
  ON story_clusters USING GIN (professions);

-- TABLE: bias_reports — used by BiasDriftAgent (may not exist yet)
CREATE TABLE IF NOT EXISTS bias_reports (
  id               SERIAL PRIMARY KEY,
  week_start       DATE UNIQUE NOT NULL,
  total_articles   INTEGER NOT NULL DEFAULT 0,
  avg_bias         FLOAT   NOT NULL DEFAULT 0,
  domain_breakdown JSONB,
  alert_triggered  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE: article_translations — ensure it exists with correct schema
CREATE TABLE IF NOT EXISTS article_translations (
  id          SERIAL PRIMARY KEY,
  cluster_id  UUID REFERENCES story_clusters(id) ON DELETE CASCADE,
  language    VARCHAR(10) NOT NULL,
  headline    TEXT,
  summary     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cluster_id, language)
);

-- TABLE: article_seo — for SEOAgent
CREATE TABLE IF NOT EXISTS article_seo (
  id               SERIAL PRIMARY KEY,
  cluster_id       UUID UNIQUE REFERENCES story_clusters(id) ON DELETE CASCADE,
  meta_title       VARCHAR(120),
  meta_description VARCHAR(320),
  keywords         TEXT,
  schema_json      JSONB,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- GRANT read access to the API user (adjust role name as needed)
-- GRANT SELECT ON bias_reports TO dhara_api;
-- GRANT SELECT ON article_translations TO dhara_api;
-- GRANT SELECT ON article_seo TO dhara_api;
-- migrations/002_sources_crawl_type.sql
-- Add source ingestion mode for admin-managed source configuration.
-- rss  = poll feed_url via RSSFeedAgent
-- html = crawl listing pages via HTMLCrawlerAgent
-- Safe to re-run (idempotent).

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS crawl_type TEXT NOT NULL DEFAULT 'rss'
  CHECK (crawl_type IN ('rss', 'html'));

-- Backfill existing rows defensively.
UPDATE sources
SET crawl_type = CASE
  WHEN feed_url IS NOT NULL AND btrim(feed_url) <> '' THEN 'rss'
  ELSE 'html'
END
WHERE crawl_type IS NULL OR btrim(crawl_type) = '';
-- Remove exact duplicate timeline rows and prevent re-insert of exact duplicates.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY cluster_id, event_text, event_date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM story_events
)
DELETE FROM story_events se
USING ranked r
WHERE se.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_story_events_cluster_event_date_text
  ON story_events (cluster_id, event_text, event_date);
-- infra/migration_civic_v3.sql
-- Dhara News — Civic Intelligence V3 Migration
-- Adds: loc_district, gov_level, gov_state, gov_ministry columns
-- Safe to run multiple times (uses IF NOT EXISTS / idempotent)
-- 
-- NOTE: main.py also runs these via the ensure_civic_columns() startup hook.
-- This file is for manual/CI runs and documentation.

-- ── 1. Location drill-down ────────────────────────────────────────────────────

ALTER TABLE story_clusters
    ADD COLUMN IF NOT EXISTS loc_district TEXT;

CREATE INDEX IF NOT EXISTS idx_clusters_district
    ON story_clusters(loc_district)
    WHERE loc_district IS NOT NULL;

-- ── 2. Government source tagging ─────────────────────────────────────────────

ALTER TABLE story_clusters
    ADD COLUMN IF NOT EXISTS gov_level    TEXT,     -- 'central' | 'state'
    ADD COLUMN IF NOT EXISTS gov_state    TEXT,     -- e.g. 'Maharashtra'
    ADD COLUMN IF NOT EXISTS gov_ministry TEXT;     -- e.g. 'Ministry of Finance'

CREATE INDEX IF NOT EXISTS idx_clusters_gov_level
    ON story_clusters(gov_level)
    WHERE gov_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clusters_gov_state
    ON story_clusters(gov_state)
    WHERE gov_state IS NOT NULL;

-- ── 3. Backfill gov_level from existing sources ───────────────────────────────
-- Tags story_clusters whose primary article source is a known central gov domain.
-- Run ONCE after adding columns. Safe to re-run (only updates NULLs).

UPDATE story_clusters c
SET gov_level = 'central'
WHERE gov_level IS NULL
  AND EXISTS (
    SELECT 1 FROM articles a
    WHERE a.cluster_id = c.id
      AND a.source_domain IN (
        'pib.gov.in', 'sansad.in', 'loksabha.nic.in', 'rajyasabha.nic.in',
        'rbi.org.in', 'sebi.gov.in', 'isro.gov.in', 'mea.gov.in', 'mha.gov.in',
        'mod.gov.in', 'mohfw.gov.in', 'education.gov.in', 'mhrd.gov.in',
        'agricoop.nic.in', 'finmin.nic.in', 'dst.gov.in', 'moef.gov.in',
        'sci.gov.in', 'eci.gov.in', 'cag.gov.in', 'niti.gov.in',
        'prsindia.org', 'india.gov.in', 'indianrailways.gov.in'
      )
  );

-- ── 4. Verify migration ──────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE 'Migration civic_v3 complete.';
    RAISE NOTICE 'loc_district rows: %', (SELECT COUNT(*) FROM story_clusters WHERE loc_district IS NOT NULL);
    RAISE NOTICE 'gov_level=central: %', (SELECT COUNT(*) FROM story_clusters WHERE gov_level = 'central');
END $$;-- Dhara: One-time domain misclassification backfill
-- Run ONCE after deploying the NLP classifier fix.
-- Safe to re-run: WHERE conditions prevent double-updates.
BEGIN;

CREATE TEMP TABLE IF NOT EXISTS domain_fix_log (
    id UUID, old_domain TEXT, new_domain TEXT, reason TEXT, headline TEXT
);

-- Crime headlines mis-labelled as technology
WITH fixed AS (
    UPDATE story_clusters SET domain = 'judiciary', last_updated = NOW()
    WHERE domain = 'technology' AND (
        headline ILIKE '%murder%' OR headline ILIKE '%murdered%' OR
        headline ILIKE '%killed%' OR headline ILIKE '%stabbed%' OR
        headline ILIKE '%arrested%' OR headline ILIKE '%FIR%' OR
        headline ILIKE '%rape%' OR headline ILIKE '%homicide%' OR
        headline ILIKE '%lynched%' OR headline ILIKE '%lynching%' OR
        headline ILIKE '%convicted%' OR headline ILIKE '%chargesheet%'
    )
    RETURNING id, 'technology' AS old_domain, domain AS new_domain, 'crime_in_tech' AS reason, headline
)
INSERT INTO domain_fix_log SELECT * FROM fixed;

-- Disaster headlines mis-labelled as entertainment
WITH fixed AS (
    UPDATE story_clusters SET domain = 'environment', last_updated = NOW()
    WHERE domain = 'entertainment' AND (
        headline ILIKE '%flood%' OR headline ILIKE '%cyclone%' OR
        headline ILIKE '%earthquake%' OR headline ILIKE '%landslide%' OR
        headline ILIKE '%tsunami%' OR headline ILIKE '%cloudburst%' OR
        headline ILIKE '%wildfire%' OR headline ILIKE '%death toll%'
    )
    RETURNING id, 'entertainment' AS old_domain, domain AS new_domain, 'disaster_in_entertainment' AS reason, headline
)
INSERT INTO domain_fix_log SELECT * FROM fixed;

-- Crime headlines mis-labelled as entertainment
WITH fixed AS (
    UPDATE story_clusters SET domain = 'judiciary', last_updated = NOW()
    WHERE domain = 'entertainment' AND (
        headline ILIKE '%murder%' OR headline ILIKE '%murdered%' OR
        headline ILIKE '%arrested%' OR headline ILIKE '%rape%' OR
        headline ILIKE '%scam%' OR headline ILIKE '%fraud%'
    )
    RETURNING id, 'entertainment' AS old_domain, domain AS new_domain, 'crime_in_entertainment' AS reason, headline
)
INSERT INTO domain_fix_log SELECT * FROM fixed;

-- Disaster headlines mis-labelled as technology
WITH fixed AS (
    UPDATE story_clusters SET domain = 'environment', last_updated = NOW()
    WHERE domain = 'technology' AND (
        headline ILIKE '%flood%' OR headline ILIKE '%cyclone%' OR
        headline ILIKE '%earthquake%' OR headline ILIKE '%tsunami%' OR
        headline ILIKE '%landslide%' OR headline ILIKE '%wildfire%'
    )
    RETURNING id, 'technology' AS old_domain, domain AS new_domain, 'disaster_in_tech' AS reason, headline
)
INSERT INTO domain_fix_log SELECT * FROM fixed;

-- Accidents mis-labelled as technology/entertainment
WITH fixed AS (
    UPDATE story_clusters SET domain = 'social', last_updated = NOW()
    WHERE domain IN ('technology', 'entertainment') AND (
        headline ILIKE '%accident%' OR headline ILIKE '%crash%' OR
        headline ILIKE '%stampede%' OR headline ILIKE '%explosion%' OR
        headline ILIKE '%building collapse%' OR headline ILIKE '%derailment%'
    )
    RETURNING id, domain AS old_domain, 'social' AS new_domain, 'accident_mislabelled' AS reason, headline
)
INSERT INTO domain_fix_log SELECT * FROM fixed;

-- ISRO/NASA articles stuck in technology → science
WITH fixed AS (
    UPDATE story_clusters SET domain = 'science', last_updated = NOW()
    WHERE domain = 'technology' AND (
        headline ILIKE '%ISRO%' OR headline ILIKE '%NASA%' OR
        headline ILIKE '%Chandrayaan%' OR headline ILIKE '%Gaganyaan%' OR
        headline ILIKE '%satellite launch%' OR headline ILIKE '%space mission%' OR
        headline ILIKE '%Aditya-L1%' OR headline ILIKE '%PSLV%'
    )
    RETURNING id, 'technology' AS old_domain, domain AS new_domain, 'space_in_tech' AS reason, headline
)
INSERT INTO domain_fix_log SELECT * FROM fixed;

-- Report
SELECT reason, COUNT(*) AS rows_fixed FROM domain_fix_log GROUP BY reason ORDER BY rows_fixed DESC;
SELECT 'Total re-classified: ' || COUNT(*) FROM domain_fix_log;
COMMIT;
