"use client";

import { useState } from "react";

interface ArticleHighlight {
  id: string;
  title: string;
  url: string;
  site_name: string | null;
  relevance_reason: string;
  highlights: string[];
}

interface ArticleAccordionProps {
  articles: ArticleHighlight[];
}

export default function ArticleAccordion({ articles }: ArticleAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (articles.length === 0) return null;

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-bg-secondary hover:bg-bg-tertiary transition-colors"
      >
        <span className="text-sm text-text-secondary">
          {isExpanded ? "▾" : "▸"} Learn more ({articles.length} source
          {articles.length !== 1 ? "s" : ""})
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="divide-y divide-border-subtle">
          {articles.map((article) => (
            <div key={article.id} className="p-4 space-y-2">
              {/* Article header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-text-primary hover:underline line-clamp-2"
                  >
                    {article.title}
                  </a>
                  {article.site_name && (
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {article.site_name}
                    </p>
                  )}
                </div>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-text-tertiary hover:text-text-secondary"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>

              {/* Relevance reason */}
              <p className="text-xs text-text-tertiary italic">
                {article.relevance_reason}
              </p>

              {/* Highlights */}
              {article.highlights.length > 0 && (
                <ul className="space-y-1.5 mt-2">
                  {article.highlights.map((highlight, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-text-secondary pl-3 border-l-2 border-border-subtle"
                    >
                      {highlight}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
