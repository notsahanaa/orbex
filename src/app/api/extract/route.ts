import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { processArticleExtraction } from "@/lib/ingestion/processArticle";

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

    // Check if article exists and already processed (for early return)
    const { data: article } = await supabase
      .from("articles")
      .select("processed_at")
      .eq("id", articleId)
      .eq("user_id", user.id)
      .single();

    if (article?.processed_at) {
      return NextResponse.json({
        success: true,
        message: "Article already processed",
        data: { alreadyProcessed: true },
      });
    }

    // Run extraction pipeline using shared utility
    const result = await processArticleExtraction(supabase, articleId, user.id);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Extraction API error:", error);

    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const statusCode = errorMessage.includes("Article not found") ? 404 :
                       errorMessage.includes("already processed") ? 409 : 500;

    return NextResponse.json(
      {
        error: "Failed to extract entities",
        details: errorMessage,
      },
      { status: statusCode }
    );
  }
}
