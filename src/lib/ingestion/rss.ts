import Parser from "rss-parser";

export interface RSSItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  content?: string;
}

export interface RSSFeed {
  title: string;
  description?: string;
  link?: string;
  items: RSSItem[];
}

/**
 * Fetches and parses an RSS feed from the given URL.
 * Returns parsed feed with title, description, and items.
 *
 * @param feedUrl - The URL of the RSS feed to fetch
 * @returns Parsed RSS feed with items
 * @throws Error if feed cannot be fetched or parsed
 */
export async function fetchRSSFeed(feedUrl: string): Promise<RSSFeed> {
  try {
    const parser = new Parser({
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'Orbex Knowledge Graph/1.0',
      },
    });

    const feed = await parser.parseURL(feedUrl);

    return {
      title: feed.title || 'Untitled Feed',
      description: feed.description,
      link: feed.link,
      items: feed.items.map((item) => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        description: item.contentSnippet || item.summary || item.description,
        pubDate: item.pubDate || item.isoDate,
        guid: item.guid || item.id || item.link,
        content: item.content || item['content:encoded'],
      })),
    };
  } catch (error) {
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error(`RSS feed fetch timeout for ${feedUrl}: Feed took too long to respond`);
      }
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        throw new Error(`RSS feed not found at ${feedUrl}: Invalid URL or domain doesn't exist`);
      }
      if (error.message.includes('Invalid RSS')) {
        throw new Error(`Invalid RSS feed format at ${feedUrl}: Not a valid RSS/Atom feed`);
      }
      throw new Error(`Failed to fetch RSS feed from ${feedUrl}: ${error.message}`);
    }
    throw new Error(`Failed to fetch RSS feed from ${feedUrl}: Unknown error`);
  }
}
