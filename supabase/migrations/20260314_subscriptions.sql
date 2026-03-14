-- Migration: Create subscriptions and subscription_articles tables
-- This migration creates the tables needed for RSS feed subscription tracking

-- ============================================
-- Create subscriptions table
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  feed_url text NOT NULL,
  is_active boolean DEFAULT true,
  last_polled_at timestamptz,
  last_article_at timestamptz,
  error_count int DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, feed_url)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_is_active_idx ON subscriptions(is_active);
CREATE INDEX IF NOT EXISTS subscriptions_last_polled_at_idx ON subscriptions(last_polled_at);

-- ============================================
-- Create subscription_articles table
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_articles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  article_url text NOT NULL,
  article_guid text,
  title text NOT NULL,
  published_at timestamptz,
  is_relevant boolean DEFAULT NULL,
  processed_at timestamptz,
  article_id uuid REFERENCES articles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(subscription_id, article_url)
);

CREATE INDEX IF NOT EXISTS subscription_articles_subscription_id_idx ON subscription_articles(subscription_id);
CREATE INDEX IF NOT EXISTS subscription_articles_article_id_idx ON subscription_articles(article_id);
CREATE INDEX IF NOT EXISTS subscription_articles_is_relevant_idx ON subscription_articles(is_relevant);
CREATE INDEX IF NOT EXISTS subscription_articles_processed_at_idx ON subscription_articles(processed_at);
CREATE INDEX IF NOT EXISTS subscription_articles_created_at_idx ON subscription_articles(created_at);

-- ============================================
-- Enable RLS on subscriptions table
-- ============================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can select their own subscriptions
CREATE POLICY "Users can select own subscriptions" ON subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own subscriptions" ON subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update own subscriptions" ON subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own subscriptions" ON subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypasses RLS entirely (no policy needed)

-- ============================================
-- Enable RLS on subscription_articles table
-- ============================================

ALTER TABLE subscription_articles ENABLE ROW LEVEL SECURITY;

-- Users can select subscription_articles where subscription belongs to them
CREATE POLICY "Users can select own subscription_articles" ON subscription_articles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_articles.subscription_id
      AND s.user_id = auth.uid()
    )
  );

-- Service role bypasses RLS entirely (no policy needed for service role access)
