import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { fetchRSSFeed } from "@/lib/ingestion/rss";
import { fetchArticleContent } from "@/lib/ingestion/fetchArticle";
import { checkRelevance } from "@/lib/ingestion/relevance";
import { processArticleExtraction } from "@/lib/ingestion/processArticle";

/**
 * POST /api/subscriptions
 * Add a new RSS subscription with optional backfill
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { feedUrl, name, backfill } = await request.json();

    // Validate required fields
    if (!feedUrl) {
      return NextResponse.json(
        { error: "feedUrl is required" },
        { status: 400 }
      );
    }

    // Validate backfill option
    if (backfill && !["none", "last5", "last10", "last25"].includes(backfill)) {
      return NextResponse.json(
        { error: "backfill must be 'none', 'last5', 'last10', or 'last25'" },
        { status: 400 }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(feedUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid feedUrl format" },
        { status: 400 }
      );
    }

    // Try to fetch the RSS feed to validate it works
    let feed;
    try {
      feed = await fetchRSSFeed(parsedUrl.href);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch RSS feed";
      return NextResponse.json(
        { error: "Invalid RSS feed", details: errorMessage },
        { status: 400 }
      );
    }

    // Use provided name or fall back to feed title
    const subscriptionName = name || feed.title;

    // Check if subscription already exists
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("feed_url", parsedUrl.href)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Subscription already exists for this feed" },
        { status: 409 }
      );
    }

    // Insert new subscription
    const { data: subscription, error: insertError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        name: subscriptionName,
        feed_url: parsedUrl.href,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating subscription:", insertError);
      return NextResponse.json(
        { error: "Failed to create subscription", details: insertError.message },
        { status: 500 }
      );
    }

    // Handle backfill
    const backfillOption = backfill || "none";
    let backfillResult = {
      articlesProcessed: 0,
      articlesRelevant: 0,
      articlesSkipped: 0,
    };

    if (backfillOption !== "none") {
      const limit = backfillOption === "last5" ? 5 : backfillOption === "last10" ? 10 : 25;
      const itemsToBackfill = feed.items.slice(0, limit);

      for (const item of itemsToBackfill) {
        try {
          const processed = await processBackfillItem(
            supabase,
            subscription.id,
            user.id,
            item
          );

          backfillResult.articlesProcessed++;
          if (processed.isRelevant) {
            backfillResult.articlesRelevant++;
          } else {
            backfillResult.articlesSkipped++;
          }
        } catch (itemError) {
          console.error(`Error backfilling item ${item.link}:`, itemError);
          backfillResult.articlesSkipped++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        subscription,
        backfill: backfillResult,
      },
    });
  } catch (error) {
    console.error("Subscriptions POST error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/subscriptions
 * List all subscriptions for the current user with article counts
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch subscriptions with article counts
    const { data: subscriptions, error } = await supabase
      .from("subscriptions")
      .select(
        `
        id,
        name,
        feed_url,
        is_active,
        last_polled_at,
        error_count,
        created_at
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return NextResponse.json(
        { error: "Failed to fetch subscriptions", details: error.message },
        { status: 500 }
      );
    }

    // For each subscription, get article counts
    const subscriptionsWithCounts = await Promise.all(
      subscriptions.map(async (sub) => {
        // Get total article count
        const { count: totalCount } = await supabase
          .from("subscription_articles")
          .select("*", { count: "exact", head: true })
          .eq("subscription_id", sub.id);

        // Get relevant article count
        const { count: relevantCount } = await supabase
          .from("subscription_articles")
          .select("*", { count: "exact", head: true })
          .eq("subscription_id", sub.id)
          .eq("is_relevant", true);

        return {
          ...sub,
          article_count: totalCount || 0,
          relevant_count: relevantCount || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        subscriptions: subscriptionsWithCounts,
      },
    });
  } catch (error) {
    console.error("Subscriptions GET error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}

/**
 * Helper function to process a single backfill item
 */
async function processBackfillItem(
  supabase: any,
  subscriptionId: string,
  userId: string,
  item: any
): Promise<{ isRelevant: boolean }> {
  // Check relevance
  const relevance = await checkRelevance({
    title: item.title,
    description: item.description,
  });

  // Create subscription_article entry
  const { data: subArticle, error: insertError } = await supabase
    .from("subscription_articles")
    .insert({
      subscription_id: subscriptionId,
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

  // If not relevant, stop here
  if (!relevance.isRelevant) {
    return { isRelevant: false };
  }

  // Fetch article content
  let fetchedArticle;
  try {
    fetchedArticle = await fetchArticleContent(item.link);
  } catch (fetchError) {
    console.error(`Failed to fetch article content for ${item.link}:`, fetchError);
    await supabase
      .from("subscription_articles")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", subArticle.id);
    return { isRelevant: true };
  }

  // Check if article already exists
  const { data: existingArticle } = await supabase
    .from("articles")
    .select("id")
    .eq("url", item.link)
    .eq("user_id", userId)
    .single();

  let articleId: string;

  if (existingArticle) {
    articleId = existingArticle.id;
  } else {
    // Insert new article
    const { data: newArticle, error: articleError } = await supabase
      .from("articles")
      .insert({
        url: fetchedArticle.url,
        title: fetchedArticle.title,
        byline: fetchedArticle.byline,
        site_name: fetchedArticle.siteName,
        content: fetchedArticle.content,
        user_id: userId,
      })
      .select()
      .single();

    if (articleError) {
      throw new Error(`Failed to insert article: ${articleError.message}`);
    }

    articleId = newArticle.id;

    // Run extraction pipeline (async, don't wait)
    processArticleExtraction(supabase, articleId, userId).catch(
      (extractError) => {
        console.error(
          `Extraction failed for article ${articleId}:`,
          extractError
        );
      }
    );
  }

  // Link article_id in subscription_articles
  await supabase
    .from("subscription_articles")
    .update({
      article_id: articleId,
      processed_at: new Date().toISOString(),
    })
    .eq("id", subArticle.id);

  return { isRelevant: true };
}
