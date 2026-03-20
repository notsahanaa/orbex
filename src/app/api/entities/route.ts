import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { EntityType } from "@/lib/extraction/schema";
import { z } from "zod";

const PostRequestSchema = z.object({
  ids: z.array(z.string().uuid()),
});

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

// POST: Fetch entities by IDs (for Ask feature graph)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = PostRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { ids } = parseResult.data;

    if (ids.length === 0) {
      return NextResponse.json({
        success: true,
        data: { entities: [], relationships: [] },
      });
    }

    // Fetch entities by IDs
    const { data: entities, error: entitiesError } = await supabase
      .from("entities")
      .select("id, name, type, description, is_primary, mention_count")
      .eq("user_id", user.id)
      .in("id", ids);

    if (entitiesError) {
      console.error("Error fetching entities:", entitiesError);
      return NextResponse.json(
        { error: "Failed to fetch entities" },
        { status: 500 }
      );
    }

    // Fetch relationships between these entities
    const { data: relationships, error: relError } = await supabase
      .from("relationships")
      .select("source_entity_id, target_entity_id, relationship_type")
      .in("source_entity_id", ids)
      .in("target_entity_id", ids);

    if (relError) {
      console.error("Error fetching relationships:", relError);
      // Continue without relationships
    }

    return NextResponse.json({
      success: true,
      data: {
        entities: entities || [],
        relationships: relationships || [],
      },
    });
  } catch (error) {
    console.error("Entities POST API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
