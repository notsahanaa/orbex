import { SupabaseClient } from "@supabase/supabase-js";
import { createOutline, extractEntities } from "@/lib/extraction/extract";
import {
  processExtractedEntities,
  createRelationships,
  createEntityMentions,
  filterByConfidence,
  createParentOfFromExtraction,
} from "@/lib/extraction/deduplicate";
import { recalculateIsPrimary } from "@/lib/extraction/hierarchy";
import { smartTruncate } from "@/lib/extraction/truncate";
import { getContextEntities, generateEmbedding } from "@/lib/extraction/embeddings";
import {
  classifyArticle,
  shouldCreateNewParadigm,
  getBestMatchingParadigms,
  extractParadigmsFromOutline,
} from "@/lib/extraction/classify";
import {
  getParadigmTree,
  getSubtreeEntities,
  createParadigm,
  attachEntityToParadigm,
  getParadigmDepth,
} from "@/lib/extraction/tree";
import { ClassificationResult, DbEntity, ArticleOutline } from "@/lib/extraction/schema";

/**
 * Generate a concise summary from the article outline.
 * This summary is used for the Ask feature's RAG pipeline.
 */
function generateSummaryFromOutline(
  title: string,
  outline: ArticleOutline
): string {
  // Build summary from outline components
  const focus = outline.primary_focus;
  const highRelevanceTopics = outline.main_topics
    .filter((t) => t.relevance === "high")
    .map((t) => t.topic);

  const topicsList =
    highRelevanceTopics.length > 0
      ? highRelevanceTopics.slice(0, 3).join(", ")
      : outline.main_topics
          .slice(0, 3)
          .map((t) => t.topic)
          .join(", ");

  return `${title}. This ${outline.article_type.replace("_", " ")} article focuses on ${focus}, covering ${topicsList}.`;
}

export interface ExtractionResult {
  outline: {
    articleType: string;
    primaryFocus: string;
    topicCount: number;
  };
  classification: {
    matchedParadigms: number;
    newParadigmCreated: string | null;
    reasoning: string;
  } | null;
  entitiesExtracted: number;
  lowConfidenceRemoved: number;
  relationshipsExtracted: number;
  entitiesSaved: number;
  entitiesMerged: number;
  contextSource: string;
  existingEntitiesUsedForContext: number;
  parentOfCreated: number;
  crossArticleParentOf: number;
  paradigmAttachments: number;
  cyclesRejected: number;
  isPrimaryUpdated: number;
}

/**
 * Runs the three-pass extraction pipeline on an article
 *
 * Pipeline stages:
 * 1. Create outline (pass 1)
 * 2. Smart truncation if >15k chars
 * 3. Paradigm classification
 * 4. Context retrieval (tree-based or embedding-based)
 * 5. Extract entities (pass 2)
 * 6. Filter by confidence
 * 7. Process entities (dedup, save)
 * 8. Create relationships
 * 9. Create parent_of relationships
 * 10. Attach to paradigms
 * 11. Recalculate is_primary
 * 12. Create entity mentions
 * 13. Mark article as processed
 *
 * @param supabase - Supabase client (can be user client or service-role client)
 * @param articleId - The article ID to process
 * @param userId - The user ID who owns the article
 * @returns Extraction statistics
 * @throws Error if article not found or processing fails
 */
export async function processArticleExtraction(
  supabase: SupabaseClient,
  articleId: string,
  userId: string
): Promise<ExtractionResult> {
  // Fetch the article
  const { data: article, error: fetchError } = await supabase
    .from("articles")
    .select("*")
    .eq("id", articleId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !article) {
    throw new Error("Article not found");
  }

  // Check if already processed
  if (article.processed_at) {
    throw new Error("Article already processed");
  }

  // ============================================
  // Three-Pass Extraction Pipeline with Paradigm Tree
  // ============================================

  // Pass 1: Create outline (~$0.01)
  const outline = await createOutline(article.content, article.title);

  // Smart truncation for long articles (>15k chars)
  const truncatedContent =
    article.content.length > 15000
      ? smartTruncate(article.content, outline)
      : article.content;

  // ============================================
  // NEW: Paradigm Classification Step
  // ============================================

  // Get the current paradigm tree
  const paradigmTree = await getParadigmTree(supabase, userId);

  // Classify article into paradigm tree (uses Haiku, ~$0.0001)
  let classification: ClassificationResult | null = null;
  let newParadigmCreated: DbEntity | null = null;
  let classifiedParadigmIds: string[] = [];

  if (paradigmTree.nodeCount > 0) {
    // Existing tree: classify article into it
    try {
      classification = await classifyArticle(outline, paradigmTree);

      // Handle new paradigm creation if needed
      if (shouldCreateNewParadigm(classification) && classification.new_paradigm) {
        const proposal = classification.new_paradigm;
        newParadigmCreated = await createParadigm(
          supabase,
          proposal.name,
          proposal.description,
          userId,
          proposal.parent_id || undefined
        );
        classifiedParadigmIds = [newParadigmCreated.id];
      } else {
        // Use matched paradigms
        classifiedParadigmIds = getBestMatchingParadigms(classification, 0.5);
      }
    } catch (err) {
      console.log("Classification failed, falling back to embedding search:", err);
      // Fall through to embedding-based context retrieval
    }
  } else {
    // COLD START: No paradigm tree exists yet
    // Extract initial paradigm structure from this article
    console.log("Cold start: Creating initial paradigm tree from article");

    try {
      const coldStartParadigms = await extractParadigmsFromOutline(outline);

      // Create L1 paradigm (organization only - no entities attach here)
      const l1 = await createParadigm(
        supabase,
        coldStartParadigms.l1.name,
        coldStartParadigms.l1.description,
        userId,
        undefined // No parent - this is a root
      );
      console.log(`Created L1 paradigm: ${l1.name} (${l1.id})`);

      // Create L2 paradigms under L1 (entities will attach to these)
      for (const l2Proposal of coldStartParadigms.l2_paradigms) {
        const l2 = await createParadigm(
          supabase,
          l2Proposal.name,
          l2Proposal.description,
          userId,
          l1.id // Parent is L1
        );
        console.log(`Created L2 paradigm: ${l2.name} (${l2.id}) under ${l1.name}`);
        classifiedParadigmIds.push(l2.id);
      }

      // Record the first L2 as the "new paradigm created" for result reporting
      if (classifiedParadigmIds.length > 0) {
        newParadigmCreated = {
          id: classifiedParadigmIds[0],
          name: coldStartParadigms.l2_paradigms[0].name,
        } as DbEntity;
      }
    } catch (err) {
      console.error("Cold start paradigm extraction failed:", err);
      // Fall through to embedding-based context retrieval
    }
  }

  // ============================================
  // Context Retrieval (tree-based or embedding-based)
  // ============================================

  let existingEntities: DbEntity[] = [];

  if (classifiedParadigmIds.length > 0) {
    // Tree-based context: Get entities from matched paradigm subtrees
    const subtreeEntitiesPromises = classifiedParadigmIds.map((paradigmId) =>
      getSubtreeEntities(supabase, paradigmId, userId)
    );
    const subtreeResults = await Promise.all(subtreeEntitiesPromises);
    const allSubtreeEntities = subtreeResults.flat();

    // Deduplicate by entity ID
    const seenIds = new Set<string>();
    existingEntities = allSubtreeEntities.filter((e) => {
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      return true;
    });

    console.log(
      `Tree-based context: ${existingEntities.length} entities from ${classifiedParadigmIds.length} paradigm(s)`
    );
  } else {
    // Fallback: Embedding-based context retrieval
    try {
      existingEntities = await getContextEntities(
        supabase,
        article.title,
        article.content,
        userId,
        25
      );
      console.log(
        `Embedding-based context: ${existingEntities.length} entities`
      );
    } catch (err) {
      console.log(
        "Context retrieval failed (embeddings may not be set up yet):",
        err
      );
      existingEntities = [];
    }
  }

  // Pass 2: Extract entities using outline context + existing entities (~$0.025)
  const extractionResult = await extractEntities(
    truncatedContent,
    article.title,
    outline,
    existingEntities
  );

  // Post-processing: Filter low-confidence entities
  const { filtered: filteredEntities, removed: lowConfidenceRemoved } =
    filterByConfidence(extractionResult.entities);

  // Process entities (dedup and save with embeddings)
  const { nameToId, parentOfRelationships, mergedCount } =
    await processExtractedEntities(supabase, filteredEntities, userId);

  // Create relationships (with Secondary ↔ Secondary filtering and parent_of handling)
  const { parentOfCreated, cyclesRejected } = await createRelationships(
    supabase,
    extractionResult.relationships,
    nameToId,
    articleId,
    filteredEntities,
    userId
  );

  // Create parent_of relationships from extraction's parent_of field (cross-article linking)
  const crossArticleParentOf = await createParentOfFromExtraction(
    supabase,
    parentOfRelationships,
    nameToId,
    articleId,
    userId
  );

  // ============================================
  // NEW: Attach non-paradigm entities to classified paradigm(s)
  // Only attach to L2/L3 paradigms (depth >= 1), not L1
  // ============================================

  let paradigmAttachments = 0;
  if (classifiedParadigmIds.length > 0) {
    // Filter to only L2/L3 paradigms for entity attachment
    const attachmentParadigmIds: string[] = [];
    for (const paradigmId of classifiedParadigmIds) {
      const depth = await getParadigmDepth(supabase, paradigmId);
      if (depth >= 1) {
        attachmentParadigmIds.push(paradigmId);
      } else {
        console.log(`Skipping L1 paradigm ${paradigmId} for entity attachment`);
      }
    }

    if (attachmentParadigmIds.length > 0) {
      // Attach tools, companies, events, case studies to the best L2/L3 paradigm
      for (const [entityName, entityId] of nameToId) {
        const entity = filteredEntities.find((e) => e.name === entityName);
        if (!entity || entity.type === "paradigm") continue;

        // Attach to the first (best matching) L2/L3 paradigm
        const primaryParadigmId = attachmentParadigmIds[0];
        const attached = await attachEntityToParadigm(
          supabase,
          entityId,
          primaryParadigmId,
          articleId
        );
        if (attached) {
          paradigmAttachments++;
        }
      }
    }
  }

  // Recalculate is_primary for entities that are children in parent_of relationships
  const { updated: isPrimaryUpdated } = await recalculateIsPrimary(
    supabase,
    userId
  );

  // Create entity mentions
  const entityIds = Array.from(nameToId.values());
  await createEntityMentions(supabase, entityIds, articleId);

  // Generate article summary and embedding for Ask feature
  const summary = generateSummaryFromOutline(article.title, outline);
  const summaryEmbedding = await generateEmbedding(`${article.title}: ${summary}`);

  // Mark article as processed and save summary + embedding
  await supabase
    .from("articles")
    .update({
      processed_at: new Date().toISOString(),
      summary,
      embedding: summaryEmbedding,
    })
    .eq("id", articleId);

  return {
    outline: {
      articleType: outline.article_type,
      primaryFocus: outline.primary_focus,
      topicCount: outline.main_topics.length,
    },
    classification: classification
      ? {
          matchedParadigms: classification.matched_paradigms.length,
          newParadigmCreated: newParadigmCreated?.name || null,
          reasoning: classification.reasoning,
        }
      : null,
    entitiesExtracted: extractionResult.entities.length,
    lowConfidenceRemoved,
    relationshipsExtracted: extractionResult.relationships.length,
    entitiesSaved: nameToId.size,
    entitiesMerged: mergedCount,
    contextSource: classifiedParadigmIds.length > 0 ? "paradigm_tree" : "embeddings",
    existingEntitiesUsedForContext: existingEntities.length,
    parentOfCreated: parentOfCreated + crossArticleParentOf.created,
    crossArticleParentOf: crossArticleParentOf.created,
    paradigmAttachments,
    cyclesRejected: cyclesRejected + crossArticleParentOf.cyclesRejected,
    isPrimaryUpdated,
  };
}
