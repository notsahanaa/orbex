/**
 * Backfill summaries and embeddings for existing articles.
 *
 * Usage:
 *   npx tsx scripts/backfill-article-summaries.ts
 *
 * Prerequisites:
 *   1. Run the migration: supabase/migrations/20260315_article_embeddings.sql
 *   2. Set environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";
import Anthropic from "@anthropic-ai/sdk";

// Load environment variables
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "set" : "missing");
  console.error("- SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_KEY ? "set" : "missing");
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic();

// Embedding pipeline singleton
let embeddingPipeline: FeatureExtractionPipeline | null = null;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    console.log("Loading embedding model (all-MiniLM-L6-v2)...");
    embeddingPipeline = (await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    )) as FeatureExtractionPipeline;
    console.log("Model loaded successfully!");
  }
  return embeddingPipeline;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

const SUMMARY_PROMPT = `You are summarizing an article for a knowledge graph system. Create a brief, factual summary that captures the key information.

Requirements:
- 2-3 sentences maximum
- Focus on WHO, WHAT, and WHY
- Mention specific tools, companies, or concepts by name
- Be factual and objective

Return only the summary text, no additional formatting.`;

async function generateSummary(
  title: string,
  content: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `${SUMMARY_PROMPT}

---

**Article Title:** ${title}

**Article Content:**
${content.slice(0, 4000)}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return textBlock.text.trim();
}

interface Article {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  embedding: number[] | null;
}

async function backfillArticleSummaries(batchSize: number = 5) {
  console.log("\n=== Backfill Article Summaries Script ===\n");

  // Get all articles without summaries or embeddings
  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, title, content, summary, embedding")
    .or("summary.is.null,embedding.is.null")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch articles:", error);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log("No articles need backfilling. All done!");
    return;
  }

  console.log(`Found ${articles.length} articles to process.\n`);

  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize) as Article[];
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(articles.length / batchSize)}...`
    );

    for (const article of batch) {
      try {
        let summary = article.summary;
        let embedding = article.embedding;

        // Generate summary if missing
        if (!summary) {
          console.log(`  Generating summary for: ${article.title.slice(0, 50)}...`);
          summary = await generateSummary(article.title, article.content);
        }

        // Generate embedding if missing
        if (!embedding) {
          const textForEmbedding = `${article.title}: ${summary}`;
          embedding = await generateEmbedding(textForEmbedding);
        }

        // Update article
        const { error: updateError } = await supabase
          .from("articles")
          .update({ summary, embedding })
          .eq("id", article.id);

        if (updateError) {
          console.error(`  Failed to update ${article.title.slice(0, 30)}:`, updateError.message);
          failed++;
        } else {
          console.log(`  ✓ ${article.title.slice(0, 50)}`);
          processed++;
        }

        // Rate limit for Claude API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`  Failed to process ${article.title.slice(0, 30)}:`, err);
        failed++;
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${articles.length}`);
}

// Run the script
backfillArticleSummaries().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
