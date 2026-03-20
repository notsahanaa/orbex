import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/extraction/embeddings";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic();

// Request schema
const AskRequestSchema = z.object({
  question: z.string().min(1),
  conversation_history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  current_entity_ids: z.array(z.string()).optional(),
});

// Response schema for structured output
const AskResponseSchema = z.object({
  answer: z.object({
    summary: z.string().describe("A concise answer to the question"),
    articles: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string(),
        site_name: z.string().nullable(),
        relevance_reason: z.string().describe("Why this article is relevant"),
        highlights: z
          .array(z.string())
          .describe("Key quotes or points from this article"),
      })
    ),
  }),
  graph: z.object({
    entity_ids: z
      .array(z.string())
      .describe("IDs of entities relevant to the answer"),
  }),
});

type AskResponse = z.infer<typeof AskResponseSchema>;

interface MatchedEntity {
  id: string;
  name: string;
  type: string;
  description: string | null;
  similarity: number;
}

interface MatchedArticle {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  site_name: string | null;
  created_at: string | null;
  similarity: number;
}

// Temporal intent detection schema
interface TemporalIntent {
  has_temporal_intent: boolean;
  date_range?: { start: string; end: string };
  recency_preference?: "recent" | "historical" | null;
}

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the user's knowledge base of articles.
You have access to article summaries and entity information from their ingested content.

When answering:
1. Synthesize information from multiple sources when relevant
2. Be specific and cite which articles support your claims
3. If you don't have enough information, say so clearly
4. Focus on the most relevant and recent information
5. When answering time-based questions (e.g., "what happened this year", "recent news"):
   - Pay attention to the publication dates provided for each article
   - Prioritize more recent articles when the user asks about "recent" or "latest" news
   - Consider the date context when synthesizing answers about events or trends

IMPORTANT: Both entities and articles are provided with their IDs in square brackets like [abc-123-uuid].
Articles also include their publication date in the format (Source, Date).
You MUST use these exact IDs in your response - do not make up IDs or modify them.

Format your response as a JSON object with this structure:
{
  "answer": {
    "summary": "A concise answer to the question",
    "articles": [
      {
        "id": "the-exact-uuid-from-brackets",
        "title": "Article Title",
        "url": "https://...",
        "site_name": "Source Name",
        "relevance_reason": "Why this article is relevant",
        "highlights": ["Key point 1", "Key point 2"]
      }
    ]
  },
  "graph": {
    "entity_ids": ["exact-entity-uuid-1", "exact-entity-uuid-2"]
  }
}

Only include entity_ids that were provided in the context. Use the exact UUIDs from the [brackets].`;

// Detect temporal intent from user question using Haiku for speed
async function detectTemporalIntent(question: string): Promise<TemporalIntent> {
  const today = new Date();
  const currentYear = today.getFullYear();

  const prompt = `Analyze this question for temporal intent and return JSON only:
"${question}"

Return a JSON object with these fields:
- has_temporal_intent: boolean (true if the question asks about time, dates, or recency)
- date_range: object with "start" and "end" dates in YYYY-MM-DD format, or null
- recency_preference: "recent" | "historical" | null

Examples:
- "what happened this year" → {"has_temporal_intent": true, "date_range": {"start": "${currentYear}-01-01", "end": "${currentYear}-12-31"}, "recency_preference": null}
- "recent news about AI" → {"has_temporal_intent": true, "date_range": null, "recency_preference": "recent"}
- "latest developments in crypto" → {"has_temporal_intent": true, "date_range": null, "recency_preference": "recent"}
- "tell me about OpenAI" → {"has_temporal_intent": false, "date_range": null, "recency_preference": null}
- "news from last month" → {"has_temporal_intent": true, "date_range": {"start": "YYYY-MM-01", "end": "YYYY-MM-DD"}, "recency_preference": null}

Today's date is ${today.toISOString().split('T')[0]}. Use this to calculate relative dates.
Return ONLY valid JSON, no explanation.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { has_temporal_intent: false };
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { has_temporal_intent: false };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      has_temporal_intent: parsed.has_temporal_intent ?? false,
      date_range: parsed.date_range ?? undefined,
      recency_preference: parsed.recency_preference ?? null,
    };
  } catch (error) {
    console.error("Error detecting temporal intent:", error);
    return { has_temporal_intent: false };
  }
}

// Calculate date filters based on temporal intent
function getDateFilters(intent: TemporalIntent): { published_after?: string; published_before?: string } {
  if (!intent.has_temporal_intent) {
    return {};
  }

  // If explicit date range provided
  if (intent.date_range) {
    return {
      published_after: intent.date_range.start,
      published_before: intent.date_range.end,
    };
  }

  // If recency preference, use last 7 days for "recent"
  if (intent.recency_preference === "recent") {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    return {
      published_after: sevenDaysAgo.toISOString().split('T')[0],
    };
  }

  return {};
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = AskRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { question, conversation_history, current_entity_ids } =
      parseResult.data;

    // Detect temporal intent and generate embedding in parallel
    const [temporalIntent, questionEmbedding] = await Promise.all([
      detectTemporalIntent(question),
      generateEmbedding(question),
    ]);

    // Get date filters based on temporal intent
    const dateFilters = getDateFilters(temporalIntent);

    // Parallel search: match entities and articles
    const [entitiesResult, articlesResult] = await Promise.all([
      supabase.rpc("match_entities", {
        query_embedding: questionEmbedding,
        match_threshold: 0.3,
        match_count: 15,
        p_user_id: user.id,
      }),
      supabase.rpc("match_articles", {
        query_embedding: questionEmbedding,
        match_threshold: 0.4,
        match_count: 10,
        p_user_id: user.id,
        p_published_after: dateFilters.published_after || null,
        p_published_before: dateFilters.published_before || null,
      }),
    ]);

    if (entitiesResult.error) {
      console.error("Error matching entities:", entitiesResult.error);
    }
    if (articlesResult.error) {
      console.error("Error matching articles:", articlesResult.error);
    }

    const matchedEntities: MatchedEntity[] = entitiesResult.data || [];
    const matchedArticles: MatchedArticle[] = articlesResult.data || [];

    // Build context for Claude
    const entityContext =
      matchedEntities.length > 0
        ? matchedEntities
            .map(
              (e) =>
                `- [${e.id}] ${e.name} (${e.type}): ${e.description?.slice(0, 200) || "No description"}`
            )
            .join("\n")
        : "No relevant entities found.";

    const articleContext =
      matchedArticles.length > 0
        ? matchedArticles
            .map((a) => {
              const dateStr = a.created_at
                ? new Date(a.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Unknown date";
              return `- [${a.id}] "${a.title}" (${a.site_name || "Unknown source"}, ${dateStr}): ${a.summary || "No summary available"}`;
            })
            .join("\n\n")
        : "No relevant articles found.";

    // Build conversation messages
    const messages: Anthropic.MessageParam[] = [];

    // Add conversation history if present
    if (conversation_history && conversation_history.length > 0) {
      for (const msg of conversation_history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current question with context
    const userMessage = `Context from knowledge base:

RELEVANT ENTITIES:
${entityContext}

RELEVANT ARTICLES:
${articleContext}

---

User question: ${question}

Please answer based on the context above. Return your response as a valid JSON object following the schema in your instructions.`;

    messages.push({
      role: "user",
      content: userMessage,
    });

    // Call Claude with structured output expectation
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    });

    // Extract text response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON from response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found, return a simple response
      return NextResponse.json({
        success: true,
        data: {
          answer: {
            summary: textBlock.text,
            articles: matchedArticles.map((a) => ({
              id: a.id,
              title: a.title,
              url: a.url,
              site_name: a.site_name,
              relevance_reason: "Matched by semantic similarity",
              highlights: [],
            })),
          },
          graph: {
            entity_ids: matchedEntities.map((e) => e.id),
          },
        } satisfies AskResponse,
      });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = AskResponseSchema.parse(parsed);

      // Merge entity IDs if this is a subquestion
      if (current_entity_ids && current_entity_ids.length > 0) {
        const mergedIds = new Set([
          ...current_entity_ids,
          ...validated.graph.entity_ids,
        ]);
        validated.graph.entity_ids = Array.from(mergedIds);
      }

      return NextResponse.json({
        success: true,
        data: validated,
      });
    } catch (parseError) {
      console.error("Failed to parse Claude response:", parseError);
      // Fallback response
      return NextResponse.json({
        success: true,
        data: {
          answer: {
            summary: textBlock.text,
            articles: matchedArticles.slice(0, 5).map((a) => ({
              id: a.id,
              title: a.title,
              url: a.url,
              site_name: a.site_name,
              relevance_reason: "Matched by semantic similarity",
              highlights: [],
            })),
          },
          graph: {
            entity_ids: matchedEntities.slice(0, 10).map((e) => e.id),
          },
        } satisfies AskResponse,
      });
    }
  } catch (error) {
    console.error("Ask API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
