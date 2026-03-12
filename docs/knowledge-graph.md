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

### Build Log

#### Step 1: Database Schema
Status: In Progress

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
