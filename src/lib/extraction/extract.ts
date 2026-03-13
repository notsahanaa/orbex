import Anthropic from "@anthropic-ai/sdk";
import { ArticleOutline, ExtractionResult } from "./schema";

const anthropic = new Anthropic();

// ============================================
// Pass 1: Outline Generation
// ============================================

const OUTLINE_PROMPT = `You are analyzing an article to create a structured outline for knowledge extraction.

Your task:
1. Identify the article type (deep_dive, survey, news, tutorial, opinion)
2. List the main topics covered (3-7 topics)
3. For each topic, list 2-3 key points discussed
4. Mark each topic's relevance: "high" if central to the article, "medium" if supporting
5. Identify the primary focus - the main concept/entity the article is about

Return JSON:
{
  "article_type": "deep_dive|survey|news|tutorial|opinion",
  "main_topics": [
    {"topic": "...", "key_points": ["...", "..."], "relevance": "high|medium"}
  ],
  "primary_focus": "..."
}`;

export async function createOutline(
  articleContent: string,
  articleTitle: string
): Promise<ArticleOutline> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${OUTLINE_PROMPT}

---

**Article Title:** ${articleTitle}

**Article Content:**
${articleContent.slice(0, 8000)}`, // Use first 8k chars for outline
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude for outline");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude outline response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return ArticleOutline.parse(parsed);
  } catch (error) {
    console.error("Failed to parse outline:", error);
    console.error("Raw response:", textBlock.text);
    throw new Error("Failed to parse outline from Claude");
  }
}

// ============================================
// Pass 2: Entity Extraction
// ============================================

const EXTRACTION_PROMPT = `You are extracting entities for a knowledge graph, using the provided outline as your guide.

EXTRACTION PHILOSOPHY:
Extract SPECIFIC, NAMED things from this article - not generic categories.

THE GOOGLE TEST:
Before extracting anything, ask: "Would someone search for this exact name?"
✅ "Cursor" - Yes, specific product
✅ "AI agents" - Yes, emerging concept people are talking about
✅ "Anthropic" - Yes, specific company
❌ "AI Development Tools" - No, generic category
❌ "Business Management Paradigms" - No, too broad
❌ "LLM with chat interface" - No, description not entity

ENTITY TYPES (in priority order):

1. **tool** (EXTRACT FIRST): Specific named products, technologies, software
   ✅ "Cursor", "Claude Code", "Docker", "Supabase", "GPT-4"
   ❌ "AI coding tools", "development platforms"

2. **company** (EXTRACT SECOND): Specific named organizations
   ✅ "Anthropic", "OpenAI", "Google", "Stripe"
   ❌ "tech companies", "AI startups", "investment firms"

3. **event** (EXTRACT THIRD): Specific dated occurrences
   ✅ "GPT-4 launch (March 2023)", "Anthropic Series D funding"
   ❌ "product launches", "funding rounds"

4. **case_study** (EXTRACT FOURTH): Specific real-world examples with details
   ✅ "How Stripe uses Claude for code review"
   ❌ "companies using AI"

5. **paradigm** (BE SELECTIVE): Important emerging concepts reshaping an industry
   ✅ "AI agents", "agentic pricing", "vibe coding", "constitutional AI"
   ❌ "AI trends", "development paradigms", "management philosophies"

   A paradigm is an EMERGING CONCEPT that:
   - Represents a shift in how people think or work
   - Has people writing articles, giving talks, building products around it
   - Would appear in a "trends to watch" list
   - Examples: "AI agents" (new way of building AI), "agentic pricing" (AI-driven pricing), "vibe coding" (intent-driven development)

   A paradigm is NOT:
   - A generic category ("AI tools", "business paradigms")
   - An established/obvious concept ("machine learning", "cloud computing")
   - A description ("LLM-based systems", "agent-like behavior")

DO NOT EXTRACT:
- Generic categories ("AI tools", "tech companies", "business paradigms")
- Descriptions ("LLM with chat interface", "agent-based system")
- Meta-concepts ("the definition problem", "the spectrum of agents")
- Anything without a proper noun or established name

QUANTITY GUIDANCE:
- A focused article about one tool: 3-5 entities (the tool, its company, maybe 1-2 paradigms it embodies)
- A survey article: 8-12 entities (multiple tools/companies mentioned)
- If you're extracting 10+ paradigms, you're doing it wrong

   **DESCRIPTION FORMAT**: For each entity, provide a DETAILED description that includes:
   - A clear explanation of what this entity is (1-2 sentences)
   - A relevant quote from the article that discusses this entity (in quotation marks)
   - Why this entity is significant in the context of the article (1 sentence)

   Example description:
   "Claude is an AI assistant developed by Anthropic, designed to be helpful, harmless, and honest. The article notes that 'Claude represents a new approach to AI safety, prioritizing constitutional AI principles.' This positions Claude as a key player in the responsible AI development space."

2. **Relationships** - Extract meaningful connections between entities.

CRITICAL RELATIONSHIP RULES:
- Every case_study MUST connect to at least one primary entity (paradigm, tool, or company)
- Every event MUST connect to at least one primary entity
- Secondary entities (case_study, event) should NEVER connect directly to each other
- Primary entities (paradigm, tool, company) CAN connect to other primary entities
- Only create relationships that are semantically meaningful, not just co-occurrence in the article

Relationship types (use these or similar):

HIERARCHY (parent_of):
- parent_of (Parent → Child): The parent is a broader concept that encompasses the child
- Can be same-type: "Agentic AI parent_of Agent-driven economy" (paradigm→paradigm)
- Can be cross-type: "Agentic coding tools parent_of Claude Code" (paradigm→tool)
- An entity can have MULTIPLE parents (DAG structure)

Examples of parent_of:
- "Claude parent_of Claude Code" (tool → tool)
- "Alphabet parent_of Google" (company → company)
- "Agentic AI parent_of Agent-driven economy" (paradigm → paradigm)
- "Agentic coding tools parent_of Cursor" (paradigm → tool)

Rules for parent_of:
- Use when one entity is a broader concept that encompasses another
- The child should be a specialization, subset, derivative, or instance of the parent
- Multiple parents allowed (e.g., Claude Code is child of both Claude AND Agentic coding tools)
- NEVER create cycles (A parent_of B parent_of A is invalid)

PRIMARY ↔ PRIMARY:
- embodies (Tool → Paradigm): "Cursor embodies vibe coding"
- enables (Tool → Paradigm): "Docker enables containerization"
- built_by (Tool → Company): "Claude built by Anthropic"
- competes_with (Company → Company): "OpenAI competes with Anthropic"
- related_to (Primary → Primary): Generic connection between primary entities

SECONDARY → PRIMARY:
- demonstrates (Case Study → Paradigm): "This workflow demonstrates AI-native development"
- uses (Case Study → Tool): "The team uses Cursor for development"
- involves (Case Study → Company): "Anthropic's approach to safety"
- released (Event → Tool): "Launch of GPT-4"
- announced_by (Event → Company): "Google announced Gemini"
- funded (Event → Company): "Series A for Startup X"

Rules:
- is_primary = true for paradigm, tool, company
- is_primary = false for case_study, event
- Keep entity names concise but specific
- Be generous with Tool → Paradigm relationships (what paradigm does this tool represent?)
- Actively look for parent_of hierarchies when entities have parent/child or general/specific relationships
- The primary_focus from outline is likely a root node in the hierarchy

EXTRACTION DEPTH BY TYPE:
- **Tools & Companies**: Extract even if briefly mentioned (use lower confidence 0.5-0.7 for brief mentions)
- **Paradigms**: Only extract if discussed with substance (must pass Google test, be an emerging named concept)
- **Events & Case Studies**: Extract if they have specific details (dates, names, concrete info)

CONFIDENCE REFLECTS DEPTH OF COVERAGE:
- 0.9-1.0: Central to the article, extensively discussed
- 0.7-0.8: Discussed with some detail
- 0.5-0.6: Mentioned briefly but still a concrete, named entity (appropriate for tools/companies)

Return valid JSON:
{
  "entities": [
    {"name": "string", "type": "paradigm|tool|company|case_study|event", "description": "Detailed 2-3 sentence description with a quote from the article", "confidence": number, "is_primary": boolean, "source_topic": "which outline topic this came from"}
  ],
  "relationships": [
    {"source_name": "string", "target_name": "string", "relationship_type": "string"}
  ]
}`;

export async function extractEntities(
  articleContent: string,
  articleTitle: string,
  outline?: ArticleOutline
): Promise<ExtractionResult> {
  // Build context from outline if available
  const outlineContext = outline
    ? `
ARTICLE OUTLINE (use this to guide extraction):
- Article Type: ${outline.article_type}
- Primary Focus: ${outline.primary_focus}
- Main Topics:
${outline.main_topics.map((t) => `  - [${t.relevance}] ${t.topic}: ${t.key_points.join(", ")}`).join("\n")}

`
    : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}
${outlineContext}
---

**Article Title:** ${articleTitle}

**Article Content:**
${articleContent.slice(0, 15000)}`, // Truncate to avoid token limits
      },
    ],
  });

  // Extract text content from response
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON from response
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate with Zod
    const result = ExtractionResult.parse(parsed);
    return result;
  } catch (error) {
    console.error("Failed to parse extraction result:", error);
    console.error("Raw response:", textBlock.text);
    throw new Error("Failed to parse extraction result from Claude");
  }
}
