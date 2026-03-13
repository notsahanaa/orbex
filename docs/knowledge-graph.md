# Knowledge Graph - Design Decisions

## Raw Requirements (User Input)

### 1. Entity Model

We need to extract and classify all information in an article into a few key entities:

| Entity Type | Category | Examples |
|-------------|----------|----------|
| Paradigms/Concepts | Primary | agent-driven economy |
| Tools/Tech | Primary | OpenClaw, Docker, Supabase, Nano Banana |
| Companies | Primary | Google, OpenClaw, Letta |
| Case Studies/Applications | Secondary | using OpenClaw for research, building gen animation tool with Nano Banana |
| Events | Secondary | tool release, acquisition, funding, security |

**Node Hierarchy:**
- **Primary Nodes (Central)**: Paradigms, Tools, Companies - these are the anchors around which all content organizes
- **Secondary Nodes**: Case Studies, Events - these attach to primary nodes

### 2. Mapping Article Content to Entities

Process flow:
1. Extract the text
2. Use Claude/Anthropic API to categorize into key entities
3. Deduplicate so we don't have too many nodes saying the same thing
   - Not just semantic similarity, but **meaning similarity**
   - If pre-existing match exists in system → merge
   - Else → create new entity
4. Secondary nodes can connect to multiple primary nodes
   - Example: "OpenClaw released new automation engine" connects to:
     - OpenClaw (company/tool)
     - Release (event)
     - "Agent-driven workflows" (paradigm)

**Design Philosophy:**
> "If a human were to look at all these articles, how would they classify this information and create mental models of the emerging paradigms, tools, etc."

**Clustering:**
- Should be **emergent, not hard-coded**
- Example: Tools cluster → "AI native developer tooling" (OpenClaw, Cursor, Supabase)
- Example: Tools cluster → "AI video generation" (Nano Banana, etc.)

### 3. Visualization as a Web

Requirements:
- Obsidian-type, second brain kind of web
- Big nodes for primary entities, smaller nodes for secondary
- Each of the 5 primary entity types should have a different color
- Secondary nodes can all be gray
- Connected nodes should have connecting lines
- All nodes need labels
- **Interaction**: Click on a node → highlight all related nodes, fade all others

### 4. Reference Images

- Full graph view: Shows interconnected nodes with labels, different sizes
- Selected graph view: Shows highlighted connections when a node is selected, faded background

### 5. Node Content

When clicking a node:
- Screen should split into 70% (graph) and 30% (panel)
- The 30% panel should slide in from the right and push the graph to fit into 70%

**Panel content for Primary Nodes:**
- Node heading
- Number of nodes connected + date last updated (update = adding a node)
- Summary of what the node is at a high-level:
  - If paradigm: what is the paradigm
  - If tool: what does the tool do
  - If company: what does the company do

**Panel content for Secondary Nodes:**
- Node heading
- Date last updated
- Summary of content extracted for that node and how it connects to the main node
- If many sources contribute to the summary, show a list of raw sources below:
  - Format: source + date + content that was parsed for that node

---

## Implementation Plan

### Phase 1: Database Schema

**Decision**: Using Supabase PostgreSQL with the following tables:
- `articles` - stores raw ingested content
- `entities` - knowledge graph nodes with type classification
- `relationships` - edges between entities
- `entity_mentions` - links articles to entities

**Deduplication Strategy** (no OpenAI):
- Phase 1: Exact match on normalized_name + type
- Phase 2: Use Claude to check semantic similarity when needed
- Threshold-based merging with mention_count tracking

### Connection Rules

**Primary entities** (hubs): paradigm, tool, company
**Secondary entities** (spokes): case_study, event

| Connection Type | Allowed? |
|-----------------|----------|
| Primary ↔ Primary | ✅ Yes |
| Secondary → Primary | ✅ Yes |
| Secondary → Multiple Primaries | ✅ Yes |
| Secondary ↔ Secondary | ❌ No |
| Co-occurrence only | ❌ No |

Connections are determined by LLM-extracted semantic relationships, not co-occurrence.
Secondary nodes can connect to multiple primary nodes.
Primary nodes serve as hubs that cluster related content across articles.

**Entity Colors**:
- Paradigm: #8B5CF6 (Purple)
- Tool: #10B981 (Emerald)
- Company: #3B82F6 (Blue)
- Case Study: #6B7280 (Gray)
- Event: #6B7280 (Gray)

---

### Phase 2: Two-Pass Entity Extraction

The extraction pipeline uses a two-pass approach inspired by how a human would take notes for a mindmap:

```
Article Input
    ↓
┌─────────────────────────────────────────┐
│ PASS 1: OUTLINE (~$0.01)                │
│ - Identify main topics (3-7)            │
│ - List 2-3 key points per topic         │
│ - Mark relevance (high/medium)          │
│ - Identify primary focus                │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ SMART TRUNCATION (if >15k chars)        │
│ - Keep intro (1500 chars)               │
│ - Keep conclusion (1000 chars)          │
│ - Keep full "high" relevance sections   │
│ - Trim "medium" to first paragraph      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ PASS 2: EXTRACTION (~$0.02)             │
│ - Extract entities per topic            │
│ - Build hierarchical relationships      │
│ - Confidence scores                     │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ POST-PROCESSING                         │
│ - Filter confidence < 0.6               │
│ - Deduplicate against existing          │
│ - Create relationships                  │
│ - Recalculate is_primary for hierarchy  │
└─────────────────────────────────────────┘
```

**Total cost: ~$0.03/article**

#### Extraction Philosophy

> "If a human had to extract the article's key points and make it into a mindmap with details, how would they do it?"

- Extract every major topic explored to **reasonable depth**
- Could be 1 entity from a focused article, or 10 from a broad one
- The test: "Would a human taking notes include this?"
- Organize into a hierarchical mindmap with connections

#### Data Flow

1. **Pass 1 Output (ArticleOutline):**
   - `article_type`: deep_dive | survey | news | tutorial | opinion
   - `main_topics`: Array of topics with key points and relevance markers
   - `primary_focus`: The main concept/entity the article is about

2. **Pass 2 Output (ExtractionResult):**
   - `entities`: Array with name, type, description, confidence, is_primary, source_topic
   - `relationships`: Array with source_name, target_name, relationship_type

---

### Build Log

#### Step 1: Database Schema
Status: Complete

#### Step 2: Two-Pass Extraction Pipeline
Status: Complete

Files:
- `src/lib/extraction/schema.ts` - ArticleOutline type, source_topic on entities
- `src/lib/extraction/extract.ts` - createOutline() + extractEntities() with outline context
- `src/lib/extraction/truncate.ts` - smartTruncate() using outline relevance
- `src/lib/extraction/deduplicate.ts` - filterByConfidence() function
- `src/app/api/extract/route.ts` - Two-pass orchestration

---

## Decisions to Revisit

This section tracks decisions made for MVP that we may want to upgrade later.

### 1. Embedding Provider for Semantic Deduplication

**Date:** 2026-03-12

**Context:** Need to deduplicate entities across articles (e.g., "GPT-4" vs "GPT-4 Turbo" vs "ChatGPT"). Embeddings enable semantic similarity matching and smart clustering.

**Options Evaluated:**

| | Text-Based | Voyage AI | OpenAI |
|---|---|---|---|
| **Cost** | Free | ~$0.0001/1K tokens | ~$0.00002/1K tokens |
| **Quality** | Basic string matching | Excellent (Anthropic-tuned) | Excellent |
| **Semantic dedup** | ❌ | ✅ | ✅ |
| **Clustering** | ❌ | ✅ | ✅ |
| **Latency** | Instant | ~100-200ms | ~100-200ms |
| **Vector dims** | N/A | 1024 | 1536 |
| **Setup** | None | New API key | New API key |
| **Anthropic alignment** | N/A | Official partner | Competitor |

**Decision:** Text-based deduplication for MVP
- Use exact match on normalized names + fuzzy matching (Levenshtein distance)
- Schema includes `embedding vector(1536)` column (left null for now)
- Ready to plug in Voyage or OpenAI when semantic features are needed

**Upgrade Trigger:** When we see duplicate entities that text matching misses, or when we want "related entities" suggestions

### 2. Two-Pass vs Single-Pass Extraction

**Date:** 2026-03-13

**Context:** Extraction quality depends on understanding article structure. A single prompt tries to do everything at once.

**Options Evaluated:**

| Approach | Cost | Quality | Debuggability |
|----------|------|---------|---------------|
| Single prompt | ~$0.02 | Depends on prompt complexity | Hard |
| Two-pass | ~$0.03 | Better - outline provides context | Good |
| Multi-pass (3+) | ~$0.05+ | Highest but overkill | Best |

**Decision:** Two-pass
- Pass 1 creates an outline that acts as a checkpoint
- Pass 2 uses outline context for better extraction
- The marginal cost increase (~$0.01) is worth the quality and debuggability gains

**Upgrade Trigger:** If we need even more structured extraction (e.g., separate passes for relationships vs entities)

### 3. Outline Depth

**Date:** 2026-03-13

**Context:** How detailed should the Pass 1 outline be?

**Options Evaluated:**

| Depth | Cost | Context for Extraction |
|-------|------|------------------------|
| Topic-level only | ~$0.005 | Minimal |
| Topic + key points | ~$0.01 | Good balance |
| Structured summary | ~$0.015 | Overkill, duplicates extraction |

**Decision:** Topic + key points
- Captures structure without duplicating extraction work
- Provides enough context for smart truncation decisions
- Key points help the extraction prompt stay focused

**Upgrade Trigger:** If we find extraction missing nuance that a more detailed outline would catch

### 4. Long Article Handling

**Date:** 2026-03-13

**Context:** Articles >15k chars need truncation to fit token limits.

**Options Evaluated:**

| Approach | Complexity | Completeness |
|----------|------------|--------------|
| Increase limit | Simple | May miss structure |
| Chunk and merge | Complex | Complete but dedup issues |
| Smart truncation | Medium | Good - outline guides what to keep |

**Decision:** Smart truncation using outline relevance markers
- Preserves intro (1500 chars) and conclusion (1000 chars)
- Keeps full text for "high" relevance sections
- Trims "medium" relevance to first paragraph
- Skips sections that don't match any outline topic

**Upgrade Trigger:** If we see important entities being missed from truncated sections

### 5. Confidence Measurement

**Date:** 2026-03-13

**Context:** How to determine if an extracted entity is worth keeping?

**Options Evaluated:**

| Method | Consistency | Accuracy |
|--------|-------------|----------|
| LLM self-reported | Low | Unknown |
| Heuristic-based | High | Objective but indirect |
| Hybrid | Medium | Best of both |

**Decision:** LLM self-reported with 0.6 threshold
- Simple to implement
- Provides a mechanism to filter noise
- Threshold can be tuned based on observed quality

**Upgrade Trigger:** If we see inconsistent confidence scores or quality issues with the 0.6 threshold
