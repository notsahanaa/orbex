import Anthropic from "@anthropic-ai/sdk";
import { ExtractionResult } from "./schema";

const anthropic = new Anthropic();

const EXTRACTION_PROMPT = `You are an expert at extracting structured knowledge from articles for a knowledge graph. Analyze the article and extract:

1. **Entities** - Extract all meaningful entities with their types:
   - **paradigm**: Ideas, trends, frameworks, concepts (e.g., "agent-driven economy", "vibe coding", "AI-native development")
   - **tool**: Products, technologies, software, repos (e.g., "Cursor", "Docker", "Supabase")
   - **company**: Organizations, startups, corporations (e.g., "OpenAI", "Anthropic", "Google")
   - **case_study**: Real-world applications or usage examples (e.g., "Using Cursor for AI-assisted coding")
   - **event**: Time-bound occurrences (e.g., "GPT-4 launch", "Series A funding", "acquisition")

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
- confidence should reflect clarity (0.5-1.0)
- Keep entity names concise but specific
- Only extract entities meaningfully discussed, not just mentioned in passing
- Be generous with Tool → Paradigm relationships (what paradigm does this tool represent?)

Return valid JSON:
{
  "entities": [
    {"name": "string", "type": "paradigm|tool|company|case_study|event", "description": "Detailed 2-3 sentence description with a quote from the article", "confidence": number, "is_primary": boolean}
  ],
  "relationships": [
    {"source_name": "string", "target_name": "string", "relationship_type": "string"}
  ]
}`;

export async function extractEntities(
  articleContent: string,
  articleTitle: string
): Promise<ExtractionResult> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}

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
