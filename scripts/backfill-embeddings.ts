/**
 * Backfill embeddings for existing entities.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts
 *
 * Prerequisites:
 *   1. Run the migration: supabase/migrations/20260313_vector_384_and_match_function.sql
 *   2. Set environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";

// Load environment variables
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "set" : "missing");
  console.error("- SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_KEY ? "set" : "missing");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Embedding pipeline singleton
let embeddingPipeline: FeatureExtractionPipeline | null = null;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    console.log("Loading embedding model (all-MiniLM-L6-v2)...");
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    ) as FeatureExtractionPipeline;
    console.log("Model loaded successfully!");
  }
  return embeddingPipeline;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

function formatForEmbedding(entity: {
  name: string;
  type: string;
  description: string | null;
}): string {
  const parts = [`${entity.name} - ${entity.type}`];
  if (entity.description) {
    parts.push(entity.description.slice(0, 500));
  }
  return parts.join(": ");
}

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

async function backfillEmbeddings(batchSize: number = 10) {
  console.log("\n=== Backfill Embeddings Script ===\n");

  // Get all entities without embeddings
  const { data: entities, error } = await supabase
    .from("entities")
    .select("id, name, type, description")
    .is("embedding", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch entities:", error);
    process.exit(1);
  }

  if (!entities || entities.length === 0) {
    console.log("No entities without embeddings found. All done!");
    return;
  }

  console.log(`Found ${entities.length} entities without embeddings.\n`);

  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize) as Entity[];
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entities.length / batchSize)}...`);

    for (const entity of batch) {
      try {
        const text = formatForEmbedding(entity);
        const embedding = await generateEmbedding(text);

        const { error: updateError } = await supabase
          .from("entities")
          .update({ embedding })
          .eq("id", entity.id);

        if (updateError) {
          console.error(`  Failed to update ${entity.name}:`, updateError.message);
          failed++;
        } else {
          console.log(`  ✓ ${entity.name} (${entity.type})`);
          processed++;
        }
      } catch (err) {
        console.error(`  Failed to embed ${entity.name}:`, err);
        failed++;
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${entities.length}`);
}

// Run the script
backfillEmbeddings().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
