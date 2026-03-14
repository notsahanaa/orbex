import { SupabaseClient } from "@supabase/supabase-js";
import { fetchRSSFeed, RSSItem } from "./rss";
import { checkRelevance } from "./relevance";
import { fetchArticleContent } from "./fetchArticle";
import { processArticleExtraction } from "./processArticle";

export interface PollResult {
  subscriptionsPolled: number;
  articlesProcessed: number;
  articlesRelevant: number;
  articlesSkipped: number;
  errors: number;
  details: SubscriptionPollResult[];
}

export interface SubscriptionPollResult {
  subscriptionId: string;
  subscriptionName: string;
  newArticles: number;
  relevantArticles: number;
  skippedArticles: number;
  error?: string;
}

interface Subscription {
  id: string;
  user_id: string;
  name: string;
  feed_url: string;
  is_active: boolean;
  last_polled_at: string | null;
  last_article_at: string | null;
  error_count: number;
  last_error: string | null;
}

/**
 * Poll all active subscriptions across all users.
 * This is called by the Vercel cron job daily.
 *
 * @param supabase - Service-role Supabase client (bypasses RLS)
 * @returns Summary of polling results
 */
export async function pollAllSubscriptions(
  supabase: SupabaseClient
): Promise<PollResult> {
  // Fetch all active subscriptions
  const { data: subscriptions, error: fetchError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("is_active", true)
    .order("last_polled_at", { ascending: true, nullsFirst: true });

  if (fetchError) {
    throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return {
      subscriptionsPolled: 0,
      articlesProcessed: 0,
      articlesRelevant: 0,
      articlesSkipped: 0,
      errors: 0,
      details: [],
    };
  }

  // Poll each subscription
  const results = await Promise.all(
    subscriptions.map((sub) => pollSubscription(supabase, sub))
  );

  // Aggregate results
  return {
    subscriptionsPolled: subscriptions.length,
    articlesProcessed: results.reduce((sum, r) => sum + r.newArticles, 0),
    articlesRelevant: results.reduce((sum, r) => sum + r.relevantArticles, 0),
    articlesSkipped: results.reduce((sum, r) => sum + r.skippedArticles, 0),
    errors: results.filter((r) => r.error).length,
    details: results,
  };
}

/**
 * Poll subscriptions for a single user.
 * This is called by the "Refresh All" button in the UI.
 *
 * @param supabase - User-scoped Supabase client (respects RLS)
 * @param userId - The user ID to poll subscriptions for
 * @returns Summary of polling results
 */
export async function pollUserSubscriptions(
  supabase: SupabaseClient,
  userId: string
): Promise<PollResult> {
  // Fetch all active subscriptions for this user
  const { data: subscriptions, error: fetchError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("last_polled_at", { ascending: true, nullsFirst: true });

  if (fetchError) {
    throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return {
      subscriptionsPolled: 0,
      articlesProcessed: 0,
      articlesRelevant: 0,
      articlesSkipped: 0,
      errors: 0,
      details: [],
    };
  }

  // Poll each subscription
  const results = await Promise.all(
    subscriptions.map((sub) => pollSubscription(supabase, sub))
  );

  // Aggregate results
  return {
    subscriptionsPolled: subscriptions.length,
    articlesProcessed: results.reduce((sum, r) => sum + r.newArticles, 0),
    articlesRelevant: results.reduce((sum, r) => sum + r.relevantArticles, 0),
    articlesSkipped: results.reduce((sum, r) => sum + r.skippedArticles, 0),
    errors: results.filter((r) => r.error).length,
    details: results,
  };
}

/**
 * Poll a single subscription and process new articles.
 *
 * Pipeline:
 * 1. Fetch RSS feed
 * 2. Filter new items (not in subscription_articles)
 * 3. Check relevance for new items
 * 4. For relevant items:
 *    - Fetch article content
 *    - Save to articles table
 *    - Run extraction pipeline
 *    - Link article_id in subscription_articles
 * 5. Update subscription error tracking
 * 6. Update last_polled_at
 *
 * @param supabase - Supabase client (service-role or user-scoped)
 * @param subscription - The subscription to poll
 * @returns Poll result for this subscription
 */
async function pollSubscription(
  supabase: SupabaseClient,
  subscription: Subscription
): Promise<SubscriptionPollResult> {
  const result: SubscriptionPollResult = {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    newArticles: 0,
    relevantArticles: 0,
    skippedArticles: 0,
  };

  try {
    // Step 1: Fetch RSS feed
    const feed = await fetchRSSFeed(subscription.feed_url);

    // Step 2: Filter new items
    const newItems = await filterNewItems(supabase, subscription.id, feed.items);
    result.newArticles = newItems.length;

    if (newItems.length === 0) {
      // No new items, just update last_polled_at
      await updateSubscriptionSuccess(supabase, subscription.id);
      return result;
    }

    // Step 3: Process each new item
    for (const item of newItems) {
      try {
        const processed = await processNewItem(
          supabase,
          subscription,
          item
        );

        if (processed.isRelevant) {
          result.relevantArticles++;
        } else {
          result.skippedArticles++;
        }
      } catch (itemError) {
        console.error(
          `Error processing item ${item.link} from subscription ${subscription.id}:`,
          itemError
        );
        result.skippedArticles++;
        // Continue with other items even if one fails
      }
    }

    // Step 4: Update subscription success state
    await updateSubscriptionSuccess(supabase, subscription.id, newItems);

    return result;
  } catch (error) {
    // Step 5: Handle subscription-level error
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `Error polling subscription ${subscription.id} (${subscription.name}):`,
      error
    );

    // Update subscription error tracking
    await updateSubscriptionError(supabase, subscription.id, errorMessage);

    result.error = errorMessage;
    return result;
  }
}

/**
 * Filter RSS items to find new ones not already in subscription_articles
 */
async function filterNewItems(
  supabase: SupabaseClient,
  subscriptionId: string,
  items: RSSItem[]
): Promise<RSSItem[]> {
  if (items.length === 0) {
    return [];
  }

  // Get all article URLs already tracked for this subscription
  const { data: existingArticles } = await supabase
    .from("subscription_articles")
    .select("article_url, article_guid")
    .eq("subscription_id", subscriptionId);

  if (!existingArticles || existingArticles.length === 0) {
    return items; // All items are new
  }

  // Create a set of existing URLs and GUIDs for fast lookup
  const existingUrls = new Set(existingArticles.map((a) => a.article_url));
  const existingGuids = new Set(
    existingArticles.map((a) => a.article_guid).filter(Boolean)
  );

  // Filter out items that already exist (by URL or GUID)
  return items.filter((item) => {
    const urlExists = existingUrls.has(item.link);
    const guidExists = item.guid && existingGuids.has(item.guid);
    return !urlExists && !guidExists;
  });
}

/**
 * Process a new RSS item through the full pipeline
 */
async function processNewItem(
  supabase: SupabaseClient,
  subscription: Subscription,
  item: RSSItem
): Promise<{ isRelevant: boolean }> {
  // Step 1: Check relevance
  const relevance = await checkRelevance({
    title: item.title,
    description: item.description,
  });

  // Step 2: Create subscription_article entry (for tracking)
  const { data: subArticle, error: insertError } = await supabase
    .from("subscription_articles")
    .insert({
      subscription_id: subscription.id,
      article_url: item.link,
      article_guid: item.guid || null,
      title: item.title,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      is_relevant: relevance.isRelevant,
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(
      `Failed to insert subscription_article: ${insertError.message}`
    );
  }

  // Step 3: If not relevant, stop here
  if (!relevance.isRelevant) {
    return { isRelevant: false };
  }

  // Step 4: Fetch article content
  let fetchedArticle;
  try {
    fetchedArticle = await fetchArticleContent(item.link);
  } catch (fetchError) {
    console.error(`Failed to fetch article content for ${item.link}:`, fetchError);
    // Mark as processed even though we couldn't fetch it
    await supabase
      .from("subscription_articles")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", subArticle.id);
    return { isRelevant: true }; // Still count as relevant for stats
  }

  // Step 5: Check if article already exists in articles table
  const { data: existingArticle } = await supabase
    .from("articles")
    .select("id")
    .eq("url", item.link)
    .eq("user_id", subscription.user_id)
    .single();

  let articleId: string;

  if (existingArticle) {
    // Article already exists, just link it
    articleId = existingArticle.id;
  } else {
    // Step 6: Insert new article
    const { data: newArticle, error: articleError } = await supabase
      .from("articles")
      .insert({
        url: fetchedArticle.url,
        title: fetchedArticle.title,
        byline: fetchedArticle.byline,
        site_name: fetchedArticle.siteName,
        content: fetchedArticle.content,
        user_id: subscription.user_id,
      })
      .select()
      .single();

    if (articleError) {
      throw new Error(`Failed to insert article: ${articleError.message}`);
    }

    articleId = newArticle.id;

    // Step 7: Run extraction pipeline (async, don't wait)
    processArticleExtraction(supabase, articleId, subscription.user_id).catch(
      (extractError) => {
        console.error(
          `Extraction failed for article ${articleId}:`,
          extractError
        );
      }
    );
  }

  // Step 8: Link article_id in subscription_articles
  await supabase
    .from("subscription_articles")
    .update({
      article_id: articleId,
      processed_at: new Date().toISOString(),
    })
    .eq("id", subArticle.id);

  return { isRelevant: true };
}

/**
 * Update subscription after successful poll
 */
async function updateSubscriptionSuccess(
  supabase: SupabaseClient,
  subscriptionId: string,
  newItems?: RSSItem[]
): Promise<void> {
  const updates: {
    last_polled_at: string;
    error_count: number;
    last_error: null;
    last_article_at?: string;
  } = {
    last_polled_at: new Date().toISOString(),
    error_count: 0,
    last_error: null,
  };

  // Update last_article_at if we found new items
  if (newItems && newItems.length > 0) {
    // Find the most recent pubDate from new items
    const pubDates = newItems
      .map((item) => (item.pubDate ? new Date(item.pubDate).getTime() : 0))
      .filter((time) => time > 0);

    if (pubDates.length > 0) {
      const latestPubDate = Math.max(...pubDates);
      updates.last_article_at = new Date(latestPubDate).toISOString();
    }
  }

  await supabase
    .from("subscriptions")
    .update(updates)
    .eq("id", subscriptionId);
}

/**
 * Update subscription after failed poll
 */
async function updateSubscriptionError(
  supabase: SupabaseClient,
  subscriptionId: string,
  errorMessage: string
): Promise<void> {
  // Get current error count
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("error_count")
    .eq("id", subscriptionId)
    .single();

  const currentErrorCount = subscription?.error_count || 0;

  await supabase
    .from("subscriptions")
    .update({
      last_polled_at: new Date().toISOString(),
      error_count: currentErrorCount + 1,
      last_error: errorMessage,
    })
    .eq("id", subscriptionId);
}
