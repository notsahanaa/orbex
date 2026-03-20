# Data Ingestion - Design Decisions

## Raw Requirements (User Input)

### 1. Subscription Model

Users should be able to "subscribe" to newsletters/feeds instead of manually adding articles:

- Add a link to a newsletter they like to "subscriptions"
- System automatically detects when new articles are posted
- Filter articles for relevance (dev paradigms, tools, companies)
- Ignore irrelevant articles automatically

### 2. Source Types

**MVP:** RSS/Atom feeds only
- Simplest to implement
- Covers most tech sources (TechCrunch, Hacker News, tech blogs)
- Many newsletters expose RSS automatically (Substack, etc.)

**Future phases:**
- Podcast RSS with audio transcription
- Email newsletters via forwarding

### 3. Polling Strategy

- **Frequency:** Once daily (cost-effective for newsletters)
- **Infrastructure:** Vercel Cron for production, manual trigger for local dev
- **Backfill on subscribe:** User chooses "from now on" | "last 5" | "last 10"

### 4. Relevance Filtering

**Scope:** Moderate (tech industry focus)
- INCLUDE: dev tools, frameworks, tech companies, funding, AI/ML, technical paradigms, case studies
- EXCLUDE: lifestyle, politics, sports, consumer electronics reviews

> "Start moderate, can tighten to strict later if needed"

### 5. UI Requirements

- Add to existing dashboard page (keep ingestion in one place)
- Show subscription list with: name, last checked, article counts
- "Refresh All" button for manual polling
- Per-subscription actions: Pause, Rename, Delete
- Modal for adding new feed with backfill option

---

## Implementation Plan

### Phase 1: Database Schema

**Decision:** Two new tables with Row Level Security

#### `subscriptions` table
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_polled_at TIMESTAMPTZ,
  last_article_at TIMESTAMPTZ,
  error_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, feed_url)
);

-- RLS: Users manage own, service role has full access
```

#### `subscription_articles` table
```sql
CREATE TABLE subscription_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  article_url TEXT NOT NULL,
  article_guid TEXT,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  is_relevant BOOLEAN,
  processed_at TIMESTAMPTZ,
  article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(subscription_id, article_url)
);

-- RLS: Access via subscription ownership
```

---

### Phase 2: Relevance Filter

The filter-first approach screens articles BEFORE full extraction:

```
RSS Feed → Fetch articles → Quick relevance check (Haiku) → Extract entities (existing pipeline)
                                    ↓
                           Irrelevant? Skip.
```

**File:** `src/lib/ingestion/relevance.ts`

```typescript
interface RelevanceResult {
  isRelevant: boolean;
  reason: string;
  confidence: number;
}

async function checkRelevance(article: {
  title: string;
  description: string;
}): Promise<RelevanceResult>
```

**Why filter-first?**
- Saves ~$0.03/article on irrelevant content
- Explicit control over what "relevant" means
- Can tune filter prompt without touching extraction

**Prompt strategy:**
- Uses Claude Haiku (~$0.003/article)
- Input: title + description only (fast/cheap)
- Threshold: confidence >= 0.5

---

### Phase 3: Polling Pipeline

```
pollAllSubscriptions(supabaseAdmin)
├── Get all active subscriptions (across all users)
├── For each subscription:
│   ├── fetchRSSFeed(feed_url) using rss-parser
│   ├── Filter to new items (not in subscription_articles)
│   ├── For each new item:
│   │   ├── Insert into subscription_articles
│   │   ├── checkRelevance(title, description)
│   │   ├── If relevant:
│   │   │   ├── fetchArticleContent(url)
│   │   │   ├── Insert into articles table
│   │   │   ├── runExtraction(articleId, userId)
│   │   │   └── Link article_id
│   │   └── Update is_relevant, processed_at
│   ├── On success: reset error_count to 0
│   ├── On failure: increment error_count, set last_error
│   └── Update last_polled_at
└── Return { processed, relevant, skipped, errors }
```

**Server-side Auth:** Cron endpoint uses service-role client to bypass RLS. User ID read from subscription record.

**RSS Parsing:** `rss-parser` npm package

---

### Phase 4: API Routes

#### Subscription Management
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/subscriptions` | Add subscription with backfill option |
| GET | `/api/subscriptions` | List user's subscriptions with stats |
| PATCH | `/api/subscriptions/[id]` | Update (toggle active, rename) |
| DELETE | `/api/subscriptions/[id]` | Remove subscription |

#### Polling
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/subscriptions/poll` | Manual trigger (requires auth) |
| GET | `/api/cron/poll-subscriptions` | Vercel cron endpoint |

---

### Phase 5: Vercel Cron

**File:** `vercel.json`
```json
{
  "crons": [{
    "path": "/api/cron/poll-subscriptions",
    "schedule": "0 8 * * *"
  }]
}
```

**Security:**
```typescript
// Vercel auto-sends Authorization header
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Required env vars:**
- `CRON_SECRET` - Set in Vercel dashboard
- `SUPABASE_SERVICE_ROLE_KEY` - For server-side DB access

---

### Phase 6: UI Changes

**Modify:** `src/app/dashboard/ArticleIngest.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  Subscriptions                              [+ Add Feed]    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ TechCrunch          RSS    Last checked: 2h ago    [⋮] ││
│  │ 12 articles · 8 relevant                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  [Refresh All]                                              │
├─────────────────────────────────────────────────────────────┤
│  Manual Article Input (existing)                            │
└─────────────────────────────────────────────────────────────┘
```

**Add Feed Modal:**
- Feed URL input
- Display name (auto-populate from feed title)
- Backfill: "From now on" | "Last 5" | "Last 10"

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/lib/ingestion/relevance.ts` | Relevance filter with Claude Haiku |
| `src/lib/ingestion/poll.ts` | Polling pipeline orchestration |
| `src/lib/ingestion/rss.ts` | RSS feed fetching/parsing |
| `src/lib/ingestion/fetchArticle.ts` | Shared content fetcher |
| `src/lib/ingestion/processArticle.ts` | Shared extraction runner |
| `src/app/api/subscriptions/route.ts` | Subscription CRUD |
| `src/app/api/subscriptions/[id]/route.ts` | Single subscription operations |
| `src/app/api/subscriptions/poll/route.ts` | Manual poll trigger |
| `src/app/api/cron/poll-subscriptions/route.ts` | Vercel cron endpoint |
| `supabase/migrations/XXXXXX_subscriptions.sql` | Schema + RLS |
| `vercel.json` | Cron configuration |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/dashboard/ArticleIngest.tsx` | Add subscriptions UI |
| `src/app/api/ingest/route.ts` | Refactor to use shared utility |
| `src/app/api/extract/route.ts` | Refactor to use shared utility |
| `package.json` | Add `rss-parser` |

### Reused Logic
| Existing Code | Reuse For |
|---------------|-----------|
| Readability + JSDOM parsing | Extract into `fetchArticle.ts` |
| Two-pass extraction pipeline | Extract into `processArticle.ts` |
| `src/lib/extraction/*` | All entity extraction, dedup, hierarchy |

---

## Build Log

#### Step 1: Database Schema
Status: Not started

#### Step 2: Shared Utilities
Status: Not started
- Extract content fetching from `/api/ingest`
- Extract extraction pipeline from `/api/extract`

#### Step 3: RSS Parsing + Relevance Filter
Status: Not started

#### Step 4: Polling Pipeline
Status: Not started

#### Step 5: API Routes
Status: Not started

#### Step 6: UI Components
Status: Not started

#### Step 7: Vercel Cron Setup
Status: Not started

---

## Decisions to Revisit

### 1. Source Type Scope

**Date:** 2026-03-14

**Context:** What content sources should the system support?

**Options Evaluated:**

| Source | Complexity | Coverage |
|--------|------------|----------|
| RSS/Atom only | Low | Most tech blogs, Substack |
| RSS + Substack direct | Low | Same (Substack has RSS) |
| RSS + Email forwarding | High | Full newsletter coverage |
| RSS + Podcast transcription | High | Audio content |

**Decision:** RSS/Atom only for MVP
- Simplest to implement
- Covers the majority of tech content sources
- No additional infrastructure needed

**Upgrade Trigger:** When users request newsletters that don't expose RSS

---

### 2. Relevance Filter Approach

**Date:** 2026-03-14

**Context:** How to determine if an article is worth processing?

**Options Evaluated:**

| Approach | Cost/Article | Accuracy | Complexity |
|----------|--------------|----------|------------|
| LLM pre-screening (Haiku) | ~$0.003 | High | Medium |
| Extract-then-filter | ~$0.035 (full) | High | Low |
| Keyword matching | Free | Low | Low |

**Decision:** LLM pre-screening with Haiku
- Cheap enough to run on everything
- Explicit control over relevance criteria
- Can tune prompt without touching extraction pipeline

**Upgrade Trigger:** If Haiku costs become significant, consider keyword pre-filter before LLM

---

### 3. Relevance Strictness

**Date:** 2026-03-14

**Context:** How strictly to filter for tech relevance?

**Options Evaluated:**

| Level | Includes | Excludes |
|-------|----------|----------|
| Strict | Only dev tools, coding concepts | General tech news, funding |
| Moderate | Tech industry broadly | Lifestyle, politics |
| Loose | Anything tech-adjacent | Only clearly off-topic |

**Decision:** Moderate (tech industry focus)
- Captures funding, case studies, industry trends
- Aligns with entity types in knowledge graph
- Can tighten to strict later if too noisy

**Upgrade Trigger:** If graph gets polluted with low-value entities

---

### 4. Polling Frequency

**Date:** 2026-03-14

**Context:** How often to check feeds for new articles?

**Options Evaluated:**

| Frequency | Freshness | Cost | Vercel Limits |
|-----------|-----------|------|---------------|
| Hourly | High | Higher API + compute | May hit limits |
| Every 6 hours | Medium | Medium | Safe |
| Daily | Low | Lowest | Safe |

**Decision:** Once daily (8am UTC)
- Newsletters typically publish once/day max
- Lowest cost
- Well within Vercel cron limits

**Upgrade Trigger:** If users need fresher news, add "Refresh All" polling more frequently

---

### 5. Backfill Strategy

**Date:** 2026-03-14

**Context:** When subscribing to a feed, what existing articles to import?

**Options Evaluated:**

| Strategy | Initial Load | User Control |
|----------|--------------|--------------|
| None (from now on) | Zero | No choice |
| Fixed (last 10) | Moderate | No choice |
| User choice | Variable | Full control |

**Decision:** User choice: none / last 5 / last 10
- Gives users flexibility
- Prevents overwhelming new users
- Clear expectation of what will be imported

**Upgrade Trigger:** If users want full archive import, add "all available" option

---

## Cost Estimates

| Operation | Cost per Article |
|-----------|------------------|
| Relevance filter (Haiku) | ~$0.003 |
| Full extraction (Sonnet) | ~$0.035 |
| **Relevant article** | ~$0.038 |
| **Irrelevant article** | ~$0.003 |

**Example:** Feed with 50% relevance, 10 articles/day
- 10 relevance checks: $0.03
- 5 extractions: $0.175
- **Daily cost: ~$0.20**
