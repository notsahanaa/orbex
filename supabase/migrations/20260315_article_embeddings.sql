-- Migration: Add article summaries and embeddings for Ask feature
-- This enables RAG-based Q&A over ingested articles

-- Step 1: Add summary and embedding columns to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Step 2: Create an index for fast similarity search on article embeddings
CREATE INDEX IF NOT EXISTS articles_embedding_idx
ON articles
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Step 3: Create the match_articles function for similarity search
CREATE OR REPLACE FUNCTION match_articles(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  summary text,
  url text,
  site_name text,
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
    1 - (a.embedding <=> query_embedding) as similarity
  FROM articles a
  WHERE
    a.embedding IS NOT NULL
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_articles TO authenticated;
