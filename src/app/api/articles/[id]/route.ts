import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: articleId } = await params;

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify article exists and belongs to user
    const { data: article, error: fetchError } = await supabase
      .from("articles")
      .select("id")
      .eq("id", articleId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Find entities that are ONLY mentioned in this article (orphans after deletion)
    const { data: orphanedEntities } = await supabase
      .from("entity_mentions")
      .select("entity_id")
      .eq("article_id", articleId);

    const orphanedEntityIds: string[] = [];

    if (orphanedEntities && orphanedEntities.length > 0) {
      for (const mention of orphanedEntities) {
        // Check if this entity has mentions in other articles
        const { count } = await supabase
          .from("entity_mentions")
          .select("*", { count: "exact", head: true })
          .eq("entity_id", mention.entity_id)
          .neq("article_id", articleId);

        if (count === 0) {
          orphanedEntityIds.push(mention.entity_id);
        }
      }
    }

    // Delete relationships involving orphaned entities
    if (orphanedEntityIds.length > 0) {
      await supabase
        .from("relationships")
        .delete()
        .or(
          `source_entity_id.in.(${orphanedEntityIds.join(",")}),target_entity_id.in.(${orphanedEntityIds.join(",")})`
        );

      // Delete orphaned entities
      await supabase.from("entities").delete().in("id", orphanedEntityIds);
    }

    // Delete entity_mentions for this article
    await supabase.from("entity_mentions").delete().eq("article_id", articleId);

    // Delete relationships sourced from this article
    await supabase.from("relationships").delete().eq("article_id", articleId);

    // Delete the article
    const { error: deleteError } = await supabase
      .from("articles")
      .delete()
      .eq("id", articleId);

    if (deleteError) {
      console.error("Error deleting article:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete article" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedArticleId: articleId,
        orphanedEntitiesDeleted: orphanedEntityIds.length,
      },
    });
  } catch (error) {
    console.error("Delete article API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
