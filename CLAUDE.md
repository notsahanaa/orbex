# Orbex - Newsfeed Second Brain

> A personal knowledge graph that auto-populates from your content feeds, extracts entities and relationships, and visualizes them as an interactive web.

---

## 1. The Idea

### Problem
You subscribe to many newsletters, podcasts, and news sites but lack the time and energy to follow up on all of them and retain information systematically.

### Solution
Build a "second brain" that:
1. **Automatically ingests** content from your chosen sources (news sites, podcasts, newsletters)
2. **Extracts structured entities** (tools, concepts, events, companies, case studies)
3. **Builds a knowledge graph** with relationships and dynamic clustering
4. **Visualizes as an interactive web** where you can explore connections

### Core Principles
- **User-controlled sources**: Add/remove feeds from the UI, not hardcoded
- **No manual curation**: The system extracts and organizes automatically
- **Grows over time**: Architecture supports continuous ingestion and scaling
- **View-only graph**: Interactive (zoom, highlight, filter) but no manual editing of nodes/relationships

---

## 2. The Stages Plan

### Stage 1: INGESTION

The pipeline that fetches content from various sources.

```
Sources → Fetcher → Raw Content Store → Processing Queue
```

#### MVP (News Sites via RSS)
- Support RSS/Atom feed ingestion
- Target sources: TechCrunch, GeekWire, Founders.inc, etc.
- Fetch on schedule (every day)
- Store raw articles with metadata (title, url, date, source)
- **Source Management UI**: Add feed URL, remove feed, view all feeds

#### Phase 2 (Podcasts)
- Podcast RSS feed parsing (get audio URLs)
- Audio transcription via Whisper API or Deepgram
- Store transcript with episode metadata
- Handle longer processing times (queue-based)

#### Phase 3 (Email Newsletters)
- Option A: Email forwarding endpoint (user forwards newsletters to dedicated address)
- Option B: IMAP connection (connect email account, filter by sender)
- HTML email parsing → clean text extraction
- Sender-based source attribution

#### Data Model: Sources
```
Source {
  id: uuid
  type: "rss" | "podcast" | "email"
  name: string              // "TechCrunch"
  url: string               // RSS URL or email address
  config: json              // type-specific settings
  is_active: boolean
  last_fetched: timestamp
  created_at: timestamp
}
```

---

### Stage 2: EXTRACTION

AI-powered extraction of structured entities from raw content.

```
Raw Content → LLM Extraction → Entities + Relationships → Normalization
```

#### Core Entity Types
| Type | Description | Examples |
|------|-------------|----------|
| **Paradigm/Concept** | Ideas, trends, frameworks | Agent-driven economy, AI design slop, vibe coding |
| **Tool/Tech** | Products, technologies, repos | OpenClaw, Docker, Supabase, interesting GitHub repos |
| **Case Study/Application** | Real-world usage examples | "Using OpenClaw to automate dev workflows" |
| **Event** | Time-bound occurrences | Tool release, acquisition, funding round, security warning |
| **Company** | Organizations | OpenAI, Anthropic, startups mentioned |

#### MVP Extraction Pipeline
1. **Chunk content** if needed (for long articles/transcripts)
2. **Call Claude API** with structured extraction prompt
3. **Parse response** into entity objects
4. **Normalize** entity names (lowercase, trim, basic dedup)
5. **Extract relationships** between entities in same content

#### Extraction Prompt Strategy
```
Given this article, extract:
1. All entities (with type: paradigm|tool|event|case_study|company)
2. Relationships between entities (entity_a, relationship_type, entity_b)
3. For each entity: name, type, brief description, confidence score

Return as structured JSON.
```

#### Phase 2 Enhancements
- Confidence thresholds (discard low-confidence extractions)
- Entity resolution across sources (is "GPT-4" same as "GPT4"?)
- Relationship type taxonomy refinement

#### Data Model: Entities
```
Entity {
  id: uuid
  name: string              // "OpenClaw"
  normalized_name: string   // "openclaw" (for dedup)
  type: entity_type         // paradigm, tool, event, case_study, company
  description: string
  is_primary: boolean       // true = central node, false = secondary
  embedding: vector(1536)   // for semantic similarity
  first_seen: timestamp
  mention_count: int
  created_at: timestamp
}
```

---

### Stage 3: KNOWLEDGE GRAPH CONSTRUCTION

Building the web of relationships and clusters.

```
Entities → Deduplication → Relationship Mapping → Clustering → Graph
```

#### Primary vs Secondary Nodes

**The Key Insight**: Primary nodes are *persistent entities* that accumulate information over time. Secondary nodes are *instances* or *specific occurrences*.

| Primary (Central) | Secondary (Peripheral) |
|-------------------|------------------------|
| OpenClaw (the tool) | OpenClaw v2.0 release (event) |
| Agent-driven economy (paradigm) | "How X company uses agents" (case study) |
| Anthropic (company) | Anthropic Series D funding (event) |

**Heuristic for Classification:**
- If it can have *multiple events/mentions attached to it* → Primary
- If it *is* the event/mention → Secondary
- Companies, Tools, Paradigms → Usually Primary
- Events, Case Studies → Usually Secondary (linked to a Primary)

#### Deduplication Strategy

**MVP: Exact + Fuzzy Match**
1. Normalize names (lowercase, remove special chars)
2. Exact match on normalized name
3. Fuzzy match (Levenshtein distance < threshold)

**Phase 2: Semantic Deduplication**
1. Generate embeddings for entity names + descriptions
2. Cosine similarity > 0.9 = potential duplicate
3. LLM confirmation for edge cases ("Is 'GPT-4' same as 'GPT-4 Turbo'?")

#### Relationship Types
```
Relationships (MVP):
- released        (Company → released → Tool)
- acquired        (Company → acquired → Company)
- uses            (Case Study → uses → Tool)
- demonstrates    (Case Study → demonstrates → Paradigm)
- funded          (Company → funded → amount/round)
- related_to      (generic fallback)

Relationships (Phase 2):
- competes_with
- built_on
- founded_by
- announced
- deprecated
```

#### Clustering (Dynamic Categories)

**No predefined categories** - clusters emerge from the data.

**MVP Approach:**
- Use entity type as base grouping (all Tools cluster together)
- Within type, use embedding similarity for sub-clusters
- Cluster names generated via LLM ("What theme connects these 5 tools?")

**Phase 2:**
- Graph community detection algorithms (Louvain, Label Propagation)
- Cross-type clustering (Tool + Paradigm if semantically related)

#### Data Model: Relationships
```
Relationship {
  id: uuid
  source_entity_id: uuid
  target_entity_id: uuid
  relationship_type: string
  confidence: float
  source_content_id: uuid    // which article established this
  created_at: timestamp
}

EntityMention {
  id: uuid
  entity_id: uuid
  content_id: uuid           // source article/podcast
  context: string            // surrounding text snippet
  mentioned_at: timestamp
}
```

---

### Stage 4: INTERFACE

The interactive visualization and exploration layer.

```
┌─────────────────────────────────────────────────────────────┐
│  [Paradigms] [Tools] [Case Studies] [Events] [Companies]   │ ← Category toggles
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Interactive Graph                        │
│                         (70%)                               │
│                                                             │
│     ○ Primary nodes: larger, saturated                     │
│     ◦ Secondary nodes: smaller, faded                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Side Panel (30% when node selected)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Node Name                                               ││
│  │ 12 sources 
|  |
|  | Descrption                                              ││
│  │─────────────────────────────────────────────────────────││
│  │ ▸ TechCrunch • Mar 5 • "OpenClaw launches..."   [link] ││
│  │ ▸ GeekWire • Mar 3 • "The rise of..."          [link] ││
│  │ ...                                                     ││
│  │─────────────────────────────────────────────────────────││
│  │ Related: [Agent Economy] [DevTools] [OpenAI]           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### Interactions

| Action | Result |
|--------|--------|
| Click category toggle | Highlight all nodes of that type, fade others |
| Click node | Highlight connected nodes, open side panel |
| Click related tag in panel | Highlight that node in graph |
| Zoom/pan | Navigate graph |
| Search | Find and focus on node |

#### Visual Encoding
- **Node size**: Primary = large, Secondary = small
- **Node color saturation**: Primary = saturated, Secondary = faded
- **Node color hue**: By entity type (see Design System)
- **Edge thickness**: By relationship strength/frequency

#### Source Management Page
```
/sources
├── Add Source (modal)
│   ├── Type selector (RSS / Podcast / Email)
│   ├── URL input
│   └── Name input
├── Source List
│   ├── Source name, type, last fetched, article count
│   ├── Toggle active/inactive
│   └── Delete source
└── Ingestion status/logs
```

---

## 3. Tech Stack

### Backend (Python/FastAPI)
```
FastAPI                 → API framework
Celery + Redis          → Background job queue (ingestion, extraction)
SQLAlchemy              → ORM
Anthropic SDK           → Claude API for extraction
feedparser              → RSS parsing
Whisper/Deepgram        → Podcast transcription (Phase 2)
```

### Database (Supabase)
```
PostgreSQL              → Relational data (entities, relationships, sources)
pgvector                → Vector embeddings for semantic search/dedup
Supabase Auth           → Optional user auth (if multi-user later)
Supabase Realtime       → Optional live updates to frontend
```

### Frontend (Next.js)
```
Next.js 14              → React framework
react-force-graph       → Graph visualization
TailwindCSS             → Styling
Zustand/Jotai           → State management
React Query             → Data fetching
```

### Infrastructure
```
Vercel                  → Frontend hosting
Railway/Render          → Backend hosting
Supabase                → Database hosting
```


---

## 4. Future Phases

### Phase 2: Podcasts + Enhanced Clustering
- [ ] Podcast RSS ingestion
- [ ] Audio transcription integration
- [ ] Semantic deduplication (embeddings)
- [ ] Improved clustering algorithms
- [ ] Search functionality
- [ ] Better primary/secondary classification

### Phase 3: Email + Polish
- [ ] Email newsletter ingestion
- [ ] Cross-source entity linking
- [ ] Advanced graph layouts
- [ ] Export functionality
- [ ] Performance optimization

---

## 5. Open Questions

1. **Embedding model**: OpenAI `text-embedding-3-small` vs Cohere vs local?
2. **Transcription service**: Whisper API vs Deepgram vs AssemblyAI?
3. **Graph layout algorithm**: Force-directed vs hierarchical vs custom?
4. **Auth**: Single-user (no auth) vs Supabase Auth from start?
5. **Hosting**: Vercel + Railway vs all-in-one platform?

---


