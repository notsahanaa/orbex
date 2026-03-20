"use client";

import { PopularFeed } from "@/lib/data/popularFeeds";

interface FeedCardProps {
  feed: PopularFeed;
  isSubscribed: boolean;
  isLoading: boolean;
  onSubscribe: (feed: PopularFeed) => void;
}

const categoryGradients: Record<string, string> = {
  "Paradigm Shifts": "from-[#1a1a2e] to-[#4a1942]",
  Tools: "from-[#0d1b2a] to-[#1b263b]",
  "Use Cases": "from-[#1a1a2e] to-[#2d3436]",
};

export function FeedCard({ feed, isSubscribed, isLoading, onSubscribe }: FeedCardProps) {
  const gradientClass = categoryGradients[feed.category] || categoryGradients["Tools"];

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-secondary overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30">
      {/* Image placeholder */}
      <div className={`h-[140px] bg-gradient-to-br ${gradientClass} flex items-center justify-center`}>
        <span className="text-4xl opacity-30">
          {feed.name.charAt(0)}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-text-primary font-medium text-sm truncate">
          {feed.name}
        </h3>
        {feed.author && (
          <p className="text-text-tertiary text-xs mt-1 truncate">
            {feed.author}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => onSubscribe(feed)}
            disabled={isSubscribed || isLoading}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
              isSubscribed
                ? "bg-green-500/20 text-green-400 cursor-default"
                : isLoading
                ? "bg-bg-primary text-text-tertiary cursor-wait"
                : "bg-accent-primary hover:bg-accent-primary/80 text-white cursor-pointer"
            }`}
          >
            {isSubscribed ? "Added ✓" : isLoading ? "Adding..." : "+ Add"}
          </button>

          <a
            href={feed.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-tertiary hover:text-text-primary transition-colors p-1"
            title={`Visit ${feed.name}`}
          >
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
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
