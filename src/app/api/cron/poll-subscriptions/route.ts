import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pollAllSubscriptions } from "@/lib/ingestion/poll";

/**
 * GET /api/cron/poll-subscriptions
 * Vercel cron endpoint that polls all active subscriptions for all users.
 *
 * This endpoint is protected by the CRON_SECRET environment variable and
 * uses a service-role Supabase client to bypass RLS and access all users' data.
 *
 * Scheduled via vercel.json: "0 8 * * *" (daily at 8am UTC)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization header (Vercel cron sends this automatically)
    const authHeader = request.headers.get("authorization");
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedToken) {
      console.warn("Unauthorized cron request - invalid or missing authorization header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create service-role Supabase client (bypasses RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("Starting daily subscription poll...");
    const startTime = Date.now();

    // Poll all subscriptions
    const result = await pollAllSubscriptions(supabaseAdmin);

    const duration = Date.now() - startTime;
    console.log(`Poll completed in ${duration}ms`, {
      subscriptionsPolled: result.subscriptionsPolled,
      articlesProcessed: result.articlesProcessed,
      articlesRelevant: result.articlesRelevant,
      articlesSkipped: result.articlesSkipped,
      errors: result.errors,
    });

    return NextResponse.json({
      success: true,
      message: "Daily subscription poll completed",
      duration: `${duration}ms`,
      data: result,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: "Cron job failed",
        details: message,
      },
      { status: 500 }
    );
  }
}
