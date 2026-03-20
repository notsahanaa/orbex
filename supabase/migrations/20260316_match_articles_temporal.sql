-- Migration: Add temporal filtering to match_articles function
-- Enables date-based filtering for time-aware search in Ask feature

-- Drop and recreate the function with new parameters
CREATE OR REPLACE FUNCTION match_articles(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL,
  p_published_after timestamptz DEFAULT NULL,
  p_published_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  summary text,
  url text,
  site_name text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id,
    a.title,
    a.summary,
    a.url,
    a.site_name,
    a.created_at,
    1 - (a.embedding <=> query_embedding) as similarity
  FROM articles a
  WHERE
    a.embedding IS NOT NULL
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_published_after IS NULL OR a.created_at >= p_published_after)
    AND (p_published_before IS NULL OR a.created_at <= p_published_before)
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_articles TO authenticated;
