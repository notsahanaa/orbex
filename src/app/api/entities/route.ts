import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { EntityType } from "@/lib/extraction/schema";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as EntityType | null;
    const limit = parseInt(searchParams.get("limit") || "100");

    let query = supabase
      .from("entities")
      .select("*")
      .eq("user_id", user.id)
      .order("mention_count", { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq("type", type);
    }

    const { data: entities, error } = await query;

    if (error) {
      console.error("Error fetching entities:", error);
      return NextResponse.json(
        { error: "Failed to fetch entities" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: entities });
  } catch (error) {
    console.error("Entities API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
