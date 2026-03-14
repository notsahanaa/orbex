import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface FetchedArticle {
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  content: string;
  length: number;
  url: string;
  fetchedAt: string;
}

/**
 * Fetches article content from a URL and extracts clean text using JSDOM + Readability
 *
 * @param url - The URL to fetch
 * @returns Extracted article data
 * @throws Error if URL is invalid, fetch fails, or parsing fails
 */
export async function fetchArticleContent(url: string): Promise<FetchedArticle> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Fetch the article
  const response = await fetch(parsedUrl.href, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Orbex/1.0; +https://orbex.app)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Parse with JSDOM and Readability
  const dom = new JSDOM(html, { url: parsedUrl.href });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Could not parse article content");
  }

  // Return extracted content
  return {
    title: article.title || "Untitled",
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    excerpt: article.excerpt ?? null,
    content: article.textContent || "",
    length: article.length || 0,
    url: parsedUrl.href,
    fetchedAt: new Date().toISOString(),
  };
}
