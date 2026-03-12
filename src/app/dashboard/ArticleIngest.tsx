"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ArticleData {
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  content: string;
  length: number;
  url: string;
  fetchedAt: string;
}

interface ExtractionResult {
  entitiesExtracted: number;
  relationshipsExtracted: number;
  entitiesSaved: number;
}

interface PastArticle {
  id: string;
  url: string;
  title: string;
  site_name: string | null;
  processed_at: string | null;
  created_at: string;
}

type ProcessingStatus = "idle" | "fetching" | "saving" | "extracting" | "done" | "error";

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${Math.floor(diffDays / 30)}mo`;
}

function getDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ArticleIngest() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);

  // Past articles state
  const [pastArticles, setPastArticles] = useState<PastArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    try {
      const response = await fetch("/api/articles");
      const result = await response.json();
      if (result.success) {
        setPastArticles(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch articles:", err);
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("fetching");
    setError(null);
    setArticle(null);
    setArticleId(null);
    setExtraction(null);

    try {
      // Step 1: Fetch article content
      const ingestResponse = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const ingestResult = await ingestResponse.json();

      if (!ingestResponse.ok) {
        throw new Error(ingestResult.error || "Failed to fetch article");
      }

      setArticle(ingestResult.data);

      // Step 2: Save article to database
      setStatus("saving");

      const saveResponse = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: ingestResult.data.url,
          title: ingestResult.data.title,
          byline: ingestResult.data.byline,
          siteName: ingestResult.data.siteName,
          content: ingestResult.data.content,
        }),
      });

      const saveResult = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveResult.error || "Failed to save article");
      }

      setArticleId(saveResult.data.id);

      // Step 3: Extract entities
      setStatus("extracting");

      const extractResponse = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: saveResult.data.id }),
      });

      const extractResult = await extractResponse.json();

      if (!extractResponse.ok) {
        throw new Error(extractResult.error || "Failed to extract entities");
      }

      setExtraction(extractResult.data);
      setStatus("done");

      // Refresh the articles list
      fetchArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
      setStatus("error");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    const confirmed = window.confirm(
      `Delete "${title.slice(0, 50)}${title.length > 50 ? "..." : ""}"?\n\nThis will remove the article and any entities only mentioned in it.`
    );

    if (!confirmed) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/articles/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to delete article");
      }

      // Refresh the list
      fetchArticles();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(err instanceof Error ? err.message : "Failed to delete article");
    } finally {
      setDeletingId(null);
    }
  };

  const statusMessages: Record<ProcessingStatus, string> = {
    idle: "Ingest",
    fetching: "Fetching article...",
    saving: "Saving to database...",
    extracting: "Extracting entities...",
    done: "Done!",
    error: "Try Again",
  };

  const isProcessing = ["fetching", "saving", "extracting"].includes(status);

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="card p-6">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            required
            disabled={isProcessing}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={isProcessing}
            className="btn btn-solid whitespace-nowrap min-w-[160px]"
          >
            {statusMessages[status]}
          </button>
        </form>

        {error && <div className="error-message mt-4">{error}</div>}
      </div>

      {/* Extraction Results */}
      {extraction && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">
                Extraction Complete
              </div>
              <div className="flex gap-6 text-sm">
                <span>
                  <span className="text-text-primary font-mono">
                    {extraction.entitiesExtracted}
                  </span>{" "}
                  <span className="text-text-tertiary">entities extracted</span>
                </span>
                <span>
                  <span className="text-text-primary font-mono">
                    {extraction.entitiesSaved}
                  </span>{" "}
                  <span className="text-text-tertiary">saved (after dedup)</span>
                </span>
                <span>
                  <span className="text-text-primary font-mono">
                    {extraction.relationshipsExtracted}
                  </span>{" "}
                  <span className="text-text-tertiary">relationships</span>
                </span>
              </div>
            </div>
            <Link href="/dashboard/graph" className="btn btn-primary">
              View Graph →
            </Link>
          </div>
        </div>
      )}

      {/* Article Content */}
      {article && (
        <div className="card p-6 space-y-6">
          {/* Metadata */}
          <div className="border-b border-border-subtle pb-6">
            <div className="text-text-tertiary text-xs uppercase tracking-wider mb-3">
              Extracted Content
            </div>
            <h3 className="text-xl mb-3">{article.title}</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-tertiary">
              {article.siteName && (
                <span>
                  <span className="text-text-secondary">Source:</span> {article.siteName}
                </span>
              )}
              {article.byline && (
                <span>
                  <span className="text-text-secondary">Author:</span> {article.byline}
                </span>
              )}
              <span>
                <span className="text-text-secondary">Length:</span>{" "}
                {article.length.toLocaleString()} chars
              </span>
            </div>
          </div>

          {/* Excerpt */}
          {article.excerpt && (
            <div>
              <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">
                Excerpt
              </div>
              <p className="text-text-secondary text-sm leading-relaxed">
                {article.excerpt}
              </p>
            </div>
          )}

          {/* Full Content */}
          <div>
            <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">
              Full Content (LLM Input)
            </div>
            <div className="bg-bg-primary border border-border-subtle rounded-md p-4 max-h-[500px] overflow-y-auto">
              <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                {article.content}
              </pre>
            </div>
          </div>

          {/* Debug Info */}
          <div className="border-t border-border-subtle pt-4">
            <div className="text-text-tertiary text-xs">
              Fetched at {new Date(article.fetchedAt).toLocaleString()} from{" "}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-text-primary underline"
              >
                {article.url}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Past Articles */}
      <div className="card p-6">
        <div className="text-text-tertiary text-xs uppercase tracking-wider mb-4">
          Past Articles
        </div>

        {loadingArticles ? (
          <div className="text-text-tertiary text-sm py-4">Loading articles...</div>
        ) : pastArticles.length === 0 ? (
          <div className="text-text-tertiary text-sm py-4">
            No articles ingested yet. Add a URL above to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {pastArticles.map((pastArticle) => (
              <div
                key={pastArticle.id}
                className="flex items-center gap-4 py-2 px-3 -mx-3 rounded-md hover:bg-bg-primary transition-colors group"
              >
                {/* Title */}
                <div className="flex-1 min-w-0">
                  <a
                    href={pastArticle.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-text-secondary truncate block"
                    title={pastArticle.title}
                  >
                    {pastArticle.title}
                  </a>
                </div>

                {/* Source domain */}
                <div className="text-xs text-text-tertiary w-24 truncate" title={pastArticle.site_name || getDomain(pastArticle.url)}>
                  {pastArticle.site_name || getDomain(pastArticle.url)}
                </div>

                {/* Relative time */}
                <div className="text-xs text-text-tertiary w-8 text-right">
                  {getRelativeTime(pastArticle.created_at)}
                </div>

                {/* Status */}
                <div className="w-6 text-center" title={pastArticle.processed_at ? "Processed" : "Pending"}>
                  {pastArticle.processed_at ? (
                    <span className="text-green-500">✓</span>
                  ) : (
                    <span className="text-text-tertiary">○</span>
                  )}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(pastArticle.id, pastArticle.title)}
                  disabled={deletingId === pastArticle.id}
                  className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-500 transition-all p-1 disabled:opacity-50"
                  title="Delete article"
                >
                  {deletingId === pastArticle.id ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
