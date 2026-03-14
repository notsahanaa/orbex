import { NextRequest, NextResponse } from "next/server";
import { fetchArticleContent } from "@/lib/ingestion/fetchArticle";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Fetch and parse article using shared utility
    const article = await fetchArticleContent(url);

    // Return extracted content
    return NextResponse.json({
      success: true,
      data: article,
    });
  } catch (error) {
    console.error("Ingestion error:", error);

    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : "Failed to process article";
    const statusCode = errorMessage.includes("Invalid URL") ? 400 :
                       errorMessage.includes("Failed to fetch") ? 400 :
                       errorMessage.includes("Could not parse") ? 400 : 500;

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
