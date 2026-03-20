-- Migration: Change embedding dimension to 384 and add similarity search function
-- Model: all-MiniLM-L6-v2 (local via @xenova/transformers)

-- Step 1: Drop the existing embedding column and recreate with 384 dimensions
-- Note: This will clear existing embeddings (which should be null anyway in MVP)
ALTER TABLE entities DROP COLUMN IF EXISTS embedding;
ALTER TABLE entities ADD COLUMN embedding vector(384);

-- Step 2: Create an index for faster similarity search
CREATE INDEX IF NOT EXISTS entities_embedding_idx
ON entities
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Step 3: Create the match_entities function for similarity search
CREATE OR REPLACE FUNCTION match_entities(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  normalized_name text,
  type text,
  description text,
  is_primary boolean,
  embedding vector(384),
  mention_count int,
  created_at timestamptz,
  user_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.normalized_name,
    e.type,
    e.description,
    e.is_primary,
    e.embedding,
    e.mention_count,
    e.created_at,
    e.user_id,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entities e
  WHERE e.user_id = p_user_id
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_entities TO authenticated;
