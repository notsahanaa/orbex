import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

    const { url, title, byline, siteName, content } = await request.json();

    if (!url || !title || !content) {
      return NextResponse.json(
        { error: "URL, title, and content are required" },
        { status: 400 }
      );
    }

    // Check if article already exists
    const { data: existing } = await supabase
      .from("articles")
      .select("id")
      .eq("url", url)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        data: { id: existing.id, isNew: false },
        message: "Article already exists",
      });
    }

    // Insert new article
    const { data: article, error } = await supabase
      .from("articles")
      .insert({
        url,
        title,
        byline: byline || null,
        site_name: siteName || null,
        content,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving article:", error);
      return NextResponse.json(
        { error: "Failed to save article" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { id: article.id, isNew: true },
    });
  } catch (error) {
    console.error("Articles API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data: articles, error } = await supabase
      .from("articles")
      .select("id, url, title, site_name, processed_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching articles:", error);
      return NextResponse.json(
        { error: "Failed to fetch articles" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: articles });
  } catch (error) {
    console.error("Articles API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
