import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { pollUserSubscriptions } from "@/lib/ingestion/poll";

/**
 * POST /api/subscriptions/poll
 * Manually trigger polling for the current user's active subscriptions
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

    // Poll user's subscriptions
    const result = await pollUserSubscriptions(supabase, user.id);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Poll API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to poll subscriptions", details: message },
      { status: 500 }
    );
  }
}
