import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createOutline, extractEntities } from "@/lib/extraction/extract";
import {
  processExtractedEntities,
  createRelationships,
  createEntityMentions,
  filterByConfidence,
} from "@/lib/extraction/deduplicate";
import { recalculateIsPrimary } from "@/lib/extraction/hierarchy";
import { smartTruncate } from "@/lib/extraction/truncate";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { articleId } = await request.json();

    if (!articleId) {
      return NextResponse.json(
        { error: "articleId is required" },
        { status: 400 }
      );
    }

    // Fetch the article
    const { data: article, error: fetchError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Check if already processed
    if (article.processed_at) {
      return NextResponse.json({
        success: true,
        message: "Article already processed",
        data: { alreadyProcessed: true },
      });
    }

    // ============================================
    // Two-Pass Extraction Pipeline
    // ============================================

    // Pass 1: Create outline (~$0.01)
    const outline = await createOutline(article.content, article.title);

    // Smart truncation for long articles (>15k chars)
    const truncatedContent =
      article.content.length > 15000
        ? smartTruncate(article.content, outline)
        : article.content;

    // Pass 2: Extract entities using outline context (~$0.02)
    const extractionResult = await extractEntities(
      truncatedContent,
      article.title,
      outline
    );

    // Post-processing: Filter low-confidence entities
    const { filtered: filteredEntities, removed: lowConfidenceRemoved } =
      filterByConfidence(extractionResult.entities);

    // Process entities (dedup and save)
    const nameToId = await processExtractedEntities(
      supabase,
      filteredEntities,
      user.id
    );

    // Create relationships (with Secondary ↔ Secondary filtering and parent_of handling)
    const { parentOfCreated, cyclesRejected } = await createRelationships(
      supabase,
      extractionResult.relationships,
      nameToId,
      articleId,
      filteredEntities,
      user.id
    );

    // Recalculate is_primary for entities that are children in parent_of relationships
    const { updated: isPrimaryUpdated } = await recalculateIsPrimary(supabase, user.id);

    // Create entity mentions
    const entityIds = Array.from(nameToId.values());
    await createEntityMentions(supabase, entityIds, articleId);

    // Mark article as processed
    await supabase
      .from("articles")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", articleId);

    return NextResponse.json({
      success: true,
      data: {
        outline: {
          articleType: outline.article_type,
          primaryFocus: outline.primary_focus,
          topicCount: outline.main_topics.length,
        },
        entitiesExtracted: extractionResult.entities.length,
        lowConfidenceRemoved,
        relationshipsExtracted: extractionResult.relationships.length,
        entitiesSaved: nameToId.size,
        parentOfCreated,
        cyclesRejected,
        isPrimaryUpdated,
      },
    });
  } catch (error) {
    console.error("Extraction API error:", error);
    return NextResponse.json(
      {
        error: "Failed to extract entities",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
