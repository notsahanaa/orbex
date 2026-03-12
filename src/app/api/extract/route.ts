import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { extractEntities } from "@/lib/extraction/extract";
import {
  processExtractedEntities,
  createRelationships,
  createEntityMentions,
} from "@/lib/extraction/deduplicate";

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

    // Extract entities using Claude
    const extractionResult = await extractEntities(
      article.content,
      article.title
    );

    // Process entities (dedup and save)
    const nameToId = await processExtractedEntities(
      supabase,
      extractionResult.entities,
      user.id
    );

    // Create relationships (with Secondary ↔ Secondary filtering)
    await createRelationships(
      supabase,
      extractionResult.relationships,
      nameToId,
      articleId,
      extractionResult.entities
    );

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
        entitiesExtracted: extractionResult.entities.length,
        relationshipsExtracted: extractionResult.relationships.length,
        entitiesSaved: nameToId.size,
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
