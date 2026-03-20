import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ArticleOutline, ClassificationResult } from "./schema";
import { ParadigmTree, formatParadigmTreeForPrompt } from "./tree";

const anthropic = new Anthropic();

// ============================================
// Cold-Start Paradigm Extraction
// ============================================

const COLD_START_PROMPT = `You are creating the initial paradigm structure for a knowledge graph.

Given an article outline, create a minimal paradigm hierarchy:
1. One L1 (broad domain) paradigm - this is for ORGANIZATION ONLY
2. One or two L2 (specific topic) paradigms under it - tools/companies attach HERE

IMPORTANT RULES:
- L1 paradigms should NEVER have tools, companies, events, or case studies attached directly
- L1 paradigms should only have paradigm children (L2)
- Tools, companies, events, and case studies attach to L2 paradigms ONLY
- L2 paradigms should be specific enough to meaningfully group entities

Example:
Article about "Claude Code AI assistant launched by Anthropic"
- L1: "AI-Powered Development" (broad domain - organization only)
  - L2: "AI Coding Assistants" ← tools like Claude Code attach here
  - L2: "AI Development Companies" ← companies like Anthropic attach here

Example:
Article about "React 19 Server Components"
- L1: "Modern Web Development" (broad domain - organization only)
  - L2: "Frontend Frameworks" ← tools like React attach here

Return JSON:
{
  "l1": {
    "name": "Broad Domain Name",
    "description": "What this domain covers"
  },
  "l2_paradigms": [
    {
      "name": "Specific Topic",
      "description": "What this topic covers",
      "entity_types": ["tool", "company"]
    }
  ]
}`;

export const ColdStartL2Paradigm = z.object({
  name: z.string(),
  description: z.string(),
  entity_types: z.array(z.string()).optional(),
});

export type ColdStartL2Paradigm = z.infer<typeof ColdStartL2Paradigm>;

export const ColdStartParadigms = z.object({
  l1: z.object({
    name: z.string(),
    description: z.string(),
  }),
  l2_paradigms: z.array(ColdStartL2Paradigm),
});

export type ColdStartParadigms = z.infer<typeof ColdStartParadigms>;

/**
 * Extract initial paradigm structure from an article outline.
 * Used for cold-start when no paradigm tree exists yet.
 *
 * @param outline - The article outline from pass 1
 * @returns L1 + L2 paradigm structure to bootstrap the tree
 */
export async function extractParadigmsFromOutline(
  outline: ArticleOutline
): Promise<ColdStartParadigms> {
  const outlineText = `
Article Type: ${outline.article_type}
Primary Focus: ${outline.primary_focus}
Main Topics:
${outline.main_topics.map((t) => `  - [${t.relevance}] ${t.topic}: ${t.key_points.join(", ")}`).join("\n")}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${COLD_START_PROMPT}

---

ARTICLE OUTLINE:
${outlineText}

---

Create an initial paradigm structure for this article. Return valid JSON.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude for cold-start extraction");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in cold-start extraction response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result = ColdStartParadigms.parse(parsed);
    return result;
  } catch (error) {
    console.error("Failed to parse cold-start paradigms:", error);
    console.error("Raw response:", textBlock.text);
    throw new Error("Failed to parse cold-start paradigms from Claude");
  }
}

const CLASSIFICATION_PROMPT = `You are classifying an article into a paradigm tree for a knowledge graph.

Your task:
1. Look at the article outline and determine which paradigm(s) in the tree best match this article's content
2. If no existing paradigm matches well, propose a new paradigm and where it should go

PARADIGM TREE STRUCTURE:
- The tree has 2-4 levels of depth (L1 = root, L2 = first children, L3 = deeper)
- Paradigms represent emerging concepts, trends, or domains (e.g., "Agentic AI", "Agentic coding tools", "Context for agentic coding")
- **L1 paradigms are for ORGANIZATION ONLY** - they should only have paradigm children
- **Tools, companies, events, and case studies attach to L2 or L3 paradigms ONLY**
- Non-leaf paradigms organize the conceptual hierarchy

CLASSIFICATION RULES:
1. **Match to L2/L3 paradigms for entity attachment** - Tools/companies only attach to L2 or L3 (depth >= 1)
2. **L1 paradigms are for organization only** - They should only have paradigm children, never tools/companies
3. **If only L1 matches, look for a suitable L2 child** - Or propose a new L2 under that L1
4. **Multiple matches are OK** - If an article spans multiple paradigms, list them all
5. **Propose new paradigms sparingly** - Only if nothing existing fits well
6. **New paradigms should have a clear parent** - Unless it's a genuinely new top-level domain

NEW PARADIGM PLACEMENT:
- If the article is about a subtopic of an existing paradigm, the new paradigm should be a child of that paradigm
- If only an L1 matches and you need to attach entities, propose a new L2 under that L1
- If the article is about a broader topic that should encompass existing paradigms, propose it as a new root
- Use parent_id=null for new root paradigms

CONFIDENCE SCORES:
- 0.9-1.0: Article is clearly about this paradigm
- 0.7-0.8: Article relates strongly to this paradigm
- 0.5-0.6: Article touches on this paradigm but it's secondary

Return JSON:
{
  "matched_paradigms": [
    {"id": "uuid", "name": "Paradigm Name", "confidence": 0.9}
  ],
  "new_paradigm": null | {
    "name": "New Paradigm Name",
    "description": "Brief description of what this paradigm covers",
    "parent_id": "uuid" | null,
    "parent_name": "Parent Name" | null
  },
  "reasoning": "Brief explanation of why these paradigms were chosen"
}`;

/**
 * Classify an article into the paradigm tree.
 * Uses Haiku for fast, low-cost classification.
 *
 * @param outline - The article outline from pass 1
 * @param paradigmTree - The current paradigm tree structure
 * @returns Classification result with matched paradigms and optional new paradigm proposal
 */
export async function classifyArticle(
  outline: ArticleOutline,
  paradigmTree: ParadigmTree
): Promise<ClassificationResult> {
  const treeFormatted = formatParadigmTreeForPrompt(paradigmTree);

  // Format outline for the prompt
  const outlineText = `
Article Type: ${outline.article_type}
Primary Focus: ${outline.primary_focus}
Main Topics:
${outline.main_topics.map((t) => `  - [${t.relevance}] ${t.topic}: ${t.key_points.join(", ")}`).join("\n")}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${CLASSIFICATION_PROMPT}

---

EXISTING PARADIGM TREE:
${treeFormatted}

---

ARTICLE OUTLINE:
${outlineText}

---

Classify this article into the paradigm tree. Return valid JSON.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude for classification");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in classification response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate with Zod
    const result = ClassificationResult.parse(parsed);
    return result;
  } catch (error) {
    console.error("Failed to parse classification result:", error);
    console.error("Raw response:", textBlock.text);
    throw new Error("Failed to parse classification result from Claude");
  }
}

/**
 * Check if classification result indicates we should create a new paradigm.
 */
export function shouldCreateNewParadigm(
  classification: ClassificationResult
): boolean {
  // Create new if:
  // 1. No matched paradigms at all
  // 2. All matched paradigms have low confidence (<0.5) AND a new paradigm is proposed
  if (classification.matched_paradigms.length === 0) {
    return classification.new_paradigm !== null;
  }

  const maxConfidence = Math.max(
    ...classification.matched_paradigms.map((p) => p.confidence)
  );

  return maxConfidence < 0.5 && classification.new_paradigm !== null;
}

/**
 * Get the best matching paradigm ID(s) for entity attachment.
 * Returns paradigm IDs sorted by confidence.
 */
export function getBestMatchingParadigms(
  classification: ClassificationResult,
  minConfidence: number = 0.5
): string[] {
  return classification.matched_paradigms
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .map((p) => p.id);
}
