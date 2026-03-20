import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";
import { SupabaseClient } from "@supabase/supabase-js";
import { DbEntity } from "./schema";

// Singleton pattern for the embedding pipeline
let embeddingPipeline: FeatureExtractionPipeline | null = null;

/**
 * Get or initialize the embedding pipeline.
 * Uses all-MiniLM-L6-v2 which produces 384-dimensional embeddings.
 */
async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    ) as FeatureExtractionPipeline;
  }
  return embeddingPipeline;
}

/**
 * Generate an embedding for the given text.
 * Returns a 384-dimensional vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  // Convert Float32Array to regular array
  return Array.from(output.data as Float32Array);
}

/**
 * Format an entity for embedding.
 * Combines name, type, and description for richer semantic matching.
 */
export function formatForEmbedding(entity: {
  name: string;
  type: string;
  description?: string | null;
}): string {
  const parts = [`${entity.name} - ${entity.type}`];
  if (entity.description) {
    // Truncate description to keep embedding input reasonable
    parts.push(entity.description.slice(0, 500));
  }
  return parts.join(": ");
}

/**
 * Find similar entities using vector similarity search.
 * Returns entities ordered by similarity (most similar first).
 */
export async function findSimilarEntities(
  supabase: SupabaseClient,
  embedding: number[],
  userId: string,
  limit: number = 20
): Promise<Array<DbEntity & { similarity: number }>> {
  // Use Supabase's pgvector similarity search
  // This requires the match_entities function to be created in the database
  const { data, error } = await supabase.rpc("match_entities", {
    query_embedding: embedding,
    match_threshold: 0.3, // Lower threshold to get more candidates
    match_count: limit,
    p_user_id: userId,
  });

  if (error) {
    console.error("Error finding similar entities:", error);
    return [];
  }

  return data || [];
}

/**
 * Get context entities for extraction.
 * Embeds the article title + intro and finds similar existing entities.
 */
export async function getContextEntities(
  supabase: SupabaseClient,
  articleTitle: string,
  articleContent: string,
  userId: string,
  limit: number = 25
): Promise<DbEntity[]> {
  // Use title + first 500 chars of content for context
  const contextText = `${articleTitle}: ${articleContent.slice(0, 500)}`;

  const embedding = await generateEmbedding(contextText);
  const similar = await findSimilarEntities(supabase, embedding, userId, limit);

  return similar;
}

/**
 * Format existing entities for inclusion in the extraction prompt.
 */
export function formatEntitiesForPrompt(entities: DbEntity[]): string {
  if (entities.length === 0) {
    return "No existing entities found.";
  }

  return entities
    .map((e) => {
      const desc = e.description ? `: ${e.description.slice(0, 100)}...` : "";
      return `- ${e.name} (${e.type})${desc}`;
    })
    .join("\n");
}
