"use client";

import { useState } from "react";
import { POPULAR_FEEDS, CATEGORIES, PopularFeed } from "@/lib/data/popularFeeds";
import { FeedCard } from "./FeedCard";

interface PopularSubscriptionsProps {
  subscribedFeedUrls: Set<string>;
  onSubscribe: (feed: PopularFeed) => Promise<void>;
}

export function PopularSubscriptions({
  subscribedFeedUrls,
  onSubscribe,
}: PopularSubscriptionsProps) {
  const [loadingFeedIds, setLoadingFeedIds] = useState<Set<string>>(new Set());

  const handleSubscribe = async (feed: PopularFeed) => {
    setLoadingFeedIds((prev) => new Set(prev).add(feed.id));
    try {
      await onSubscribe(feed);
    } finally {
      setLoadingFeedIds((prev) => {
        const next = new Set(prev);
        next.delete(feed.id);
        return next;
      });
    }
  };

  const feedsByCategory = CATEGORIES.map((category) => ({
    category,
    feeds: POPULAR_FEEDS.filter((f) => f.category === category),
  }));

  return (
    <div className="space-y-8">
      {feedsByCategory.map(({ category, feeds }) => (
        <div key={category}>
          <h3 className="text-text-tertiary text-xs uppercase tracking-wider mb-4">
            {category}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {feeds.map((feed) => (
              <FeedCard
                key={feed.id}
                feed={feed}
                isSubscribed={subscribedFeedUrls.has(feed.feedUrl)}
                isLoading={loadingFeedIds.has(feed.id)}
                onSubscribe={handleSubscribe}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
