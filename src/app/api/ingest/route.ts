import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Fetch the article
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Orbex/1.0; +https://orbex.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: 400 }
      );
    }

    const html = await response.text();

    // Parse with JSDOM and Readability
    const dom = new JSDOM(html, { url: parsedUrl.href });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return NextResponse.json(
        { error: "Could not parse article content" },
        { status: 400 }
      );
    }

    // Return extracted content
    return NextResponse.json({
      success: true,
      data: {
        title: article.title,
        byline: article.byline,
        siteName: article.siteName,
        excerpt: article.excerpt,
        content: article.textContent,
        length: article.length,
        url: parsedUrl.href,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Ingestion error:", error);
    return NextResponse.json(
      { error: "Failed to process article" },
      { status: 500 }
    );
  }
}
