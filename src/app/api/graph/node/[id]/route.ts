import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { NodeDetails, NodeSource } from "@/types/graph";
import { EntityType } from "@/lib/extraction/schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: entityId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch entity
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id, name, type, description, is_primary, mention_count")
      .eq("id", entityId)
      .eq("user_id", user.id)
      .single();

    if (entityError || !entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    // Count connected entities (relationships where this entity is source or target)
    const { count: connectedCount } = await supabase
      .from("relationships")
      .select("id", { count: "exact", head: true })
      .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);

    // Fetch entity mentions with article details
    const { data: mentions, error: mentionsError } = await supabase
      .from("entity_mentions")
      .select(
        `
        id,
        context,
        created_at,
        articles (
          id,
          title,
          url,
          site_name,
          created_at
        )
      `
      )
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (mentionsError) {
      console.error("Error fetching mentions:", mentionsError);
    }

    // Transform mentions to sources
    const sources: NodeSource[] = [];
    let latestUpdate: string | null = null;

    if (mentions) {
      for (const mention of mentions) {
        const article = mention.articles as unknown as {
          id: string;
          title: string;
          url: string;
          site_name: string | null;
          created_at: string;
        } | null;

        if (article) {
          sources.push({
            article_id: article.id,
            title: article.title,
            url: article.url,
            site_name: article.site_name,
            published_at: article.created_at,
            context: mention.context,
          });
        }

        // Track latest update
        if (!latestUpdate || mention.created_at > latestUpdate) {
          latestUpdate = mention.created_at;
        }
      }
    }

    const nodeDetails: NodeDetails = {
      id: entity.id,
      name: entity.name,
      type: entity.type as EntityType,
      description: entity.description,
      is_primary: entity.is_primary,
      mention_count: entity.mention_count,
      connected_count: connectedCount || 0,
      updated_at: latestUpdate,
      sources,
    };

    return NextResponse.json({ success: true, data: nodeDetails });
  } catch (error) {
    console.error("Node details API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
