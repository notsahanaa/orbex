import { z } from "zod";

// ============================================
// Pass 1: Article Outline Schema
// ============================================

export const ArticleType = z.enum([
  "deep_dive",
  "survey",
  "news",
  "tutorial",
  "opinion",
]);

export type ArticleType = z.infer<typeof ArticleType>;

export const OutlineTopic = z.object({
  topic: z.string().describe("Main topic heading"),
  key_points: z.array(z.string()).describe("2-3 key points discussed under this topic"),
  relevance: z.enum(["high", "medium"]).describe("high = central to article, medium = supporting"),
});

export type OutlineTopic = z.infer<typeof OutlineTopic>;

export const ArticleOutline = z.object({
  article_type: ArticleType,
  main_topics: z.array(OutlineTopic),
  primary_focus: z.string().describe("The main concept/entity the article is about"),
});

export type ArticleOutline = z.infer<typeof ArticleOutline>;

// ============================================
// Pass 2: Entity Extraction Schema
// ============================================

export const EntityType = z.enum([
  "paradigm",
  "tool",
  "company",
  "case_study",
  "event",
]);

export type EntityType = z.infer<typeof EntityType>;

export const ExtractedEntity = z.object({
  name: z.string().describe("The entity name"),
  type: EntityType.describe("The entity type"),
  description: z.string().describe("Detailed description with context and quotes from the article"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
  is_primary: z.boolean().describe("True for paradigm/tool/company, false for case_study/event"),
  source_topic: z.string().optional().describe("Which outline topic this entity came from"),
});

export type ExtractedEntity = z.infer<typeof ExtractedEntity>;

export const ExtractedRelationship = z.object({
  source_name: z.string().describe("Name of the source entity"),
  target_name: z.string().describe("Name of the target entity"),
  relationship_type: z.string().describe("Type of relationship (e.g., released, uses, demonstrates, acquired, funded, related_to)"),
});

export type ExtractedRelationship = z.infer<typeof ExtractedRelationship>;

export const ExtractionResult = z.object({
  entities: z.array(ExtractedEntity),
  relationships: z.array(ExtractedRelationship),
});

export type ExtractionResult = z.infer<typeof ExtractionResult>;

// Database entity type (after saving to Supabase)
export interface DbEntity {
  id: string;
  name: string;
  normalized_name: string;
  type: EntityType;
  description: string | null;
  is_primary: boolean;
  embedding: number[] | null;
  mention_count: number;
  created_at: string;
  user_id: string;
}

export interface DbRelationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  article_id: string | null;
  created_at: string;
}

export interface DbEntityMention {
  id: string;
  entity_id: string;
  article_id: string;
  context: string | null;
  created_at: string;
}

export interface DbArticle {
  id: string;
  url: string;
  title: string;
  byline: string | null;
  site_name: string | null;
  content: string;
  processed_at: string | null;
  created_at: string;
  user_id: string;
}
