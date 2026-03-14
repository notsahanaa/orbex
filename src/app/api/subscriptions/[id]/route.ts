import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/subscriptions/[id]
 * Update a subscription (toggle is_active, rename)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: subscriptionId } = await params;
    const { name, is_active } = await request.json();

    // Validate that at least one field is being updated
    if (name === undefined && is_active === undefined) {
      return NextResponse.json(
        { error: "At least one field (name or is_active) must be provided" },
        { status: 400 }
      );
    }

    // Check if subscription exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: {
      name?: string;
      is_active?: boolean;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (is_active !== undefined) {
      if (typeof is_active !== "boolean") {
        return NextResponse.json(
          { error: "is_active must be a boolean" },
          { status: 400 }
        );
      }
      updates.is_active = is_active;
    }

    // Update subscription
    const { data: subscription, error: updateError } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating subscription:", updateError);
      return NextResponse.json(
        { error: "Failed to update subscription", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    console.error("Subscription PATCH error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/subscriptions/[id]
 * Remove a subscription (cascade delete subscription_articles via DB constraint)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: subscriptionId } = await params;

    // Check if subscription exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, name")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    // Delete subscription (cascade will handle subscription_articles)
    const { error: deleteError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", subscriptionId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting subscription:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete subscription", details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Subscription "${existing.name}" deleted successfully`,
    });
  } catch (error) {
    console.error("Subscription DELETE error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}
