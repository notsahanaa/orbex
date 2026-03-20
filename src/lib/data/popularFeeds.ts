export interface PopularFeed {
  id: string;
  name: string;
  author?: string;
  feedUrl: string;
  siteUrl: string;
  imageUrl?: string;
  category: string;
}

export const POPULAR_FEEDS: PopularFeed[] = [
  // Paradigm Shifts
  {
    id: "the-batch",
    name: "The Batch",
    author: "Andrew Ng",
    feedUrl: "https://www.deeplearning.ai/the-batch/feed",
    siteUrl: "https://www.deeplearning.ai/the-batch/",
    category: "Paradigm Shifts",
  },
  {
    id: "import-ai",
    name: "Import AI",
    author: "Jack Clark",
    feedUrl: "https://importai.substack.com/feed",
    siteUrl: "https://importai.substack.com/",
    category: "Paradigm Shifts",
  },
  {
    id: "stratechery",
    name: "Stratechery",
    author: "Ben Thompson",
    feedUrl: "https://stratechery.com/feed",
    siteUrl: "https://stratechery.com/",
    category: "Paradigm Shifts",
  },

  // Tools
  {
    id: "hacker-news",
    name: "Hacker News",
    feedUrl: "https://news.ycombinator.com/rss",
    siteUrl: "https://news.ycombinator.com/",
    category: "Tools",
  },
  {
    id: "simon-willison",
    name: "Simon Willison's Weblog",
    author: "Simon Willison",
    feedUrl: "https://simonwillison.net/atom/everything",
    siteUrl: "https://simonwillison.net/",
    category: "Tools",
  },

  // Use Cases
  {
    id: "every",
    name: "Every",
    feedUrl: "https://every.to/feed",
    siteUrl: "https://every.to/",
    category: "Use Cases",
  },
  {
    id: "one-useful-thing",
    name: "One Useful Thing",
    author: "Ethan Mollick",
    feedUrl: "https://www.oneusefulthing.org/feed",
    siteUrl: "https://www.oneusefulthing.org/",
    category: "Use Cases",
  },
  {
    id: "latent-space",
    name: "Latent Space",
    feedUrl: "https://www.latent.space/feed",
    siteUrl: "https://www.latent.space/",
    category: "Use Cases",
  },
];

export const CATEGORIES = ["Paradigm Shifts", "Tools", "Use Cases"] as const;

export type Category = (typeof CATEGORIES)[number];
