-- Migration: Fix articles unique constraint
-- Problem: articles_url_key is unique on just 'url', should be on (url, user_id)
-- This allows different users to save the same article

-- Step 1: Drop the existing unique constraint on url only
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_url_key;

-- Step 2: Create new composite unique constraint on (url, user_id)
ALTER TABLE articles ADD CONSTRAINT articles_url_user_key UNIQUE (url, user_id);
