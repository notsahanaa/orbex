import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { GraphData, GraphNode, GraphLink } from "@/types/graph";
import { EntityType } from "@/lib/extraction/schema";
import { getEntityDepth } from "@/lib/extraction/hierarchy";

/**
 * Extract domain from a URL (e.g., "https://a16z.com/podcast/..." -> "a16z.com")
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove www. prefix if present
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

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
    const types = searchParams.get("types")?.split(",") as EntityType[] | null;

    // Fetch entities
    let entitiesQuery = supabase
      .from("entities")
      .select("id, name, type, description, is_primary, mention_count")
      .eq("user_id", user.id);

    if (types && types.length > 0) {
      entitiesQuery = entitiesQuery.in("type", types);
    }

    const { data: entities, error: entitiesError } = await entitiesQuery;

    if (entitiesError) {
      console.error("Error fetching entities:", entitiesError);
      return NextResponse.json(
        { error: "Failed to fetch entities" },
        { status: 500 }
      );
    }

    // Get entity IDs for relationship filtering
    const entityIds = entities?.map((e) => e.id) || [];

    // Fetch relationships for these entities
    const { data: relationships, error: relError } = await supabase
      .from("relationships")
      .select("source_entity_id, target_entity_id, relationship_type")
      .in("source_entity_id", entityIds)
      .in("target_entity_id", entityIds);

    if (relError) {
      console.error("Error fetching relationships:", relError);
      return NextResponse.json(
        { error: "Failed to fetch relationships" },
        { status: 500 }
      );
    }

    // Fetch entity mentions with article URLs to get sources
    const { data: mentions, error: mentionsError } = await supabase
      .from("entity_mentions")
      .select("entity_id, created_at, articles(url)")
      .in("entity_id", entityIds);

    if (mentionsError) {
      console.error("Error fetching entity mentions:", mentionsError);
      // Don't fail - just proceed without source data
    }

    // Calculate hierarchy depth for each entity
    const entityDepths = new Map<string, number>();
    let maxDepth = 0;
    for (const entity of entities || []) {
      const depth = await getEntityDepth(supabase, entity.id, user.id);
      entityDepths.set(entity.id, depth);
      maxDepth = Math.max(maxDepth, depth);
    }

    // Build a map of entity_id -> source domains and latest update time
    const entitySources = new Map<string, Set<string>>();
    const entityUpdatedAt = new Map<string, string>();
    const allSources = new Set<string>();

    if (mentions) {
      for (const mention of mentions) {
        // Track latest update time per entity
        const currentLatest = entityUpdatedAt.get(mention.entity_id);
        if (!currentLatest || mention.created_at > currentLatest) {
          entityUpdatedAt.set(mention.entity_id, mention.created_at);
        }

        // Supabase returns the joined table as an object (not array) for single FK relationship
        const article = mention.articles as unknown as { url: string } | null;
        if (article?.url) {
          const domain = extractDomain(article.url);
          allSources.add(domain);

          if (!entitySources.has(mention.entity_id)) {
            entitySources.set(mention.entity_id, new Set());
          }
          entitySources.get(mention.entity_id)!.add(domain);
        }
      }
    }

    // Transform to graph format
    const nodes: GraphNode[] = (entities || []).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type as EntityType,
      description: e.description,
      is_primary: e.is_primary,
      mention_count: e.mention_count,
      sources: Array.from(entitySources.get(e.id) || []),
      updated_at: entityUpdatedAt.get(e.id) || null,
      hierarchy_depth: entityDepths.get(e.id) ?? 0,
    }));

    const links: GraphLink[] = (relationships || []).map((r) => ({
      source: r.source_entity_id,
      target: r.target_entity_id,
      relationship_type: r.relationship_type,
    }));

    const graphData: GraphData = {
      nodes,
      links,
      availableSources: Array.from(allSources).sort(),
      max_depth: maxDepth,
    };

    return NextResponse.json({ success: true, data: graphData });
  } catch (error) {
    console.error("Graph API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
