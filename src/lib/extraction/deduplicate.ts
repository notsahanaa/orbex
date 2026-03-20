import { SupabaseClient } from "@supabase/supabase-js";
import { ExtractedEntity, DbEntity, EntityType } from "./schema";
import { normalizeEntityName, areNamesSimilar } from "./normalize";
import { wouldCreateCycle, isParentOfRelationship } from "./hierarchy";
import { generateEmbedding, formatForEmbedding } from "./embeddings";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

interface DeduplicationResult {
  entityId: string;
  isNew: boolean;
  merged: boolean;
}

/**
 * Filter entities by confidence threshold.
 * Removes entities with confidence below the threshold.
 */
export function filterByConfidence(
  entities: ExtractedEntity[],
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): { filtered: ExtractedEntity[]; removed: number } {
  const filtered = entities.filter((e) => e.confidence >= threshold);
  return {
    filtered,
    removed: entities.length - filtered.length,
  };
}

/**
 * Find or create an entity, handling deduplication.
 *
 * Strategy:
 * 0. If matches_existing is set, find and merge with that entity (LLM-directed merge)
 * 1. Exact match on normalized_name + type
 * 2. Fuzzy match on similar names of same type
 * 3. Create new if no match found (with embedding)
 */
export async function findOrCreateEntity(
  supabase: SupabaseClient,
  entity: ExtractedEntity,
  userId: string
): Promise<DeduplicationResult> {
  const normalizedName = normalizeEntityName(entity.name);

  // Step 0: LLM-directed merge - if matches_existing is set, use that
  if (entity.matches_existing) {
    const normalizedMatch = normalizeEntityName(entity.matches_existing);
    const { data: llmMatch } = await supabase
      .from("entities")
      .select("*")
      .eq("normalized_name", normalizedMatch)
      .eq("user_id", userId)
      .single();

    if (llmMatch) {
      // Update mention count for the matched entity
      await supabase
        .from("entities")
        .update({ mention_count: llmMatch.mention_count + 1 })
        .eq("id", llmMatch.id);

      return {
        entityId: llmMatch.id,
        isNew: false,
        merged: true,
      };
    }
    // If LLM's suggested match doesn't exist, fall through to normal dedup
    console.log(
      `LLM suggested match "${entity.matches_existing}" not found, falling back to normal dedup`
    );
  }

  // Step 1: Try exact match on normalized_name + type
  const { data: exactMatch } = await supabase
    .from("entities")
    .select("*")
    .eq("normalized_name", normalizedName)
    .eq("type", entity.type)
    .eq("user_id", userId)
    .single();

  if (exactMatch) {
    // Update mention count
    await supabase
      .from("entities")
      .update({ mention_count: exactMatch.mention_count + 1 })
      .eq("id", exactMatch.id);

    return {
      entityId: exactMatch.id,
      isNew: false,
      merged: true,
    };
  }

  // Step 2: Fuzzy match - get all entities of same type for this user
  const { data: candidates } = await supabase
    .from("entities")
    .select("*")
    .eq("type", entity.type)
    .eq("user_id", userId);

  if (candidates && candidates.length > 0) {
    for (const candidate of candidates) {
      if (areNamesSimilar(entity.name, candidate.name, 0.85)) {
        // Found a fuzzy match - merge into existing
        await supabase
          .from("entities")
          .update({ mention_count: candidate.mention_count + 1 })
          .eq("id", candidate.id);

        return {
          entityId: candidate.id,
          isNew: false,
          merged: true,
        };
      }
    }
  }

  // Step 3: No match found - create new entity with embedding
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(formatForEmbedding(entity));
  } catch (err) {
    console.error("Failed to generate embedding for entity:", entity.name, err);
    // Continue without embedding - it can be backfilled later
  }

  const { data: newEntity, error } = await supabase
    .from("entities")
    .insert({
      name: entity.name,
      normalized_name: normalizedName,
      type: entity.type,
      description: entity.description,
      is_primary: entity.is_primary,
      mention_count: 1,
      user_id: userId,
      embedding: embedding,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === "23505") {
      // Retry with exact match
      const { data: retryMatch } = await supabase
        .from("entities")
        .select("*")
        .eq("normalized_name", normalizedName)
        .eq("type", entity.type)
        .eq("user_id", userId)
        .single();

      if (retryMatch) {
        return {
          entityId: retryMatch.id,
          isNew: false,
          merged: true,
        };
      }
    }
    throw error;
  }

  return {
    entityId: newEntity.id,
    isNew: true,
    merged: false,
  };
}

interface ProcessEntitiesResult {
  nameToId: Map<string, string>;
  parentOfRelationships: Array<{
    parent_name: string;
    child_name: string;
  }>;
  mergedCount: number;
}

/**
 * Process all extracted entities from an article.
 * Returns a map of entity names to their database IDs, plus parent_of relationships.
 */
export async function processExtractedEntities(
  supabase: SupabaseClient,
  entities: ExtractedEntity[],
  userId: string
): Promise<ProcessEntitiesResult> {
  const nameToId = new Map<string, string>();
  const parentOfRelationships: Array<{ parent_name: string; child_name: string }> = [];
  let mergedCount = 0;

  for (const entity of entities) {
    const result = await findOrCreateEntity(supabase, entity, userId);
    nameToId.set(entity.name, result.entityId);

    if (result.merged) {
      mergedCount++;
    }

    // Collect parent_of relationships from extracted entity
    // entity.parent_of contains names of existing entities that should be parents OF this entity
    if (entity.parent_of && entity.parent_of.length > 0) {
      for (const parentName of entity.parent_of) {
        parentOfRelationships.push({
          parent_name: parentName,
          child_name: entity.name,
        });
      }
    }
  }

  return { nameToId, parentOfRelationships, mergedCount };
}

/**
 * Create parent_of relationships from the extraction's parent_of field.
 * These link existing entities (parents) to newly extracted entities (children).
 */
export async function createParentOfFromExtraction(
  supabase: SupabaseClient,
  parentOfRelationships: Array<{ parent_name: string; child_name: string }>,
  nameToId: Map<string, string>,
  articleId: string,
  userId: string
): Promise<{ created: number; notFound: number; cyclesRejected: number }> {
  let created = 0;
  let notFound = 0;
  let cyclesRejected = 0;

  for (const rel of parentOfRelationships) {
    // Get child ID from nameToId (extracted in this article)
    const childId = nameToId.get(rel.child_name);
    if (!childId) {
      console.log(`Child entity "${rel.child_name}" not found in extracted entities`);
      notFound++;
      continue;
    }

    // Find parent entity by name (existing entity, may have any type)
    const normalizedParentName = normalizeEntityName(rel.parent_name);
    const { data: parentEntity } = await supabase
      .from("entities")
      .select("id")
      .eq("normalized_name", normalizedParentName)
      .eq("user_id", userId)
      .single();

    if (!parentEntity) {
      console.log(`Parent entity "${rel.parent_name}" not found in knowledge graph`);
      notFound++;
      continue;
    }

    // Check for cycles before creating relationship
    const wouldCycle = await wouldCreateCycle(supabase, parentEntity.id, childId, userId);
    if (wouldCycle) {
      console.log(`Rejecting cycle-creating parent_of: ${rel.parent_name} → ${rel.child_name}`);
      cyclesRejected++;
      continue;
    }

    // Create the parent_of relationship
    const { error } = await supabase.from("relationships").upsert(
      {
        source_entity_id: parentEntity.id,
        target_entity_id: childId,
        relationship_type: "parent_of",
        article_id: articleId,
      },
      {
        onConflict: "source_entity_id,target_entity_id,relationship_type",
        ignoreDuplicates: true,
      }
    );

    if (!error) {
      created++;
    }
  }

  return { created, notFound, cyclesRejected };
}

/**
 * Create relationships between entities.
 * Filters out invalid Secondary ↔ Secondary connections.
 * parent_of relationships bypass the secondary↔secondary filter and include cycle validation.
 */
export async function createRelationships(
  supabase: SupabaseClient,
  relationships: Array<{
    source_name: string;
    target_name: string;
    relationship_type: string;
  }>,
  nameToId: Map<string, string>,
  articleId: string,
  entities: ExtractedEntity[],
  userId: string
): Promise<{ parentOfCreated: number; cyclesRejected: number }> {
  // Build a map of entity names to their is_primary status
  const entityPrimaryMap = new Map<string, boolean>();
  for (const entity of entities) {
    entityPrimaryMap.set(entity.name, entity.is_primary);
  }

  let parentOfCreated = 0;
  let cyclesRejected = 0;

  for (const rel of relationships) {
    const sourceId = nameToId.get(rel.source_name);
    const targetId = nameToId.get(rel.target_name);

    if (!sourceId || !targetId) {
      // Skip relationships where entities weren't found
      continue;
    }

    // Handle parent_of relationships specially
    if (isParentOfRelationship(rel.relationship_type)) {
      // Check for cycles before inserting
      const wouldCycle = await wouldCreateCycle(supabase, sourceId, targetId, userId);

      if (wouldCycle) {
        console.log(
          `Rejecting cycle-creating parent_of: ${rel.source_name} → ${rel.target_name}`
        );
        cyclesRejected++;
        continue;
      }

      // parent_of relationships bypass the secondary↔secondary filter
      const { error } = await supabase.from("relationships").upsert(
        {
          source_entity_id: sourceId,
          target_entity_id: targetId,
          relationship_type: rel.relationship_type,
          article_id: articleId,
        },
        {
          onConflict: "source_entity_id,target_entity_id,relationship_type",
          ignoreDuplicates: true,
        }
      );

      if (!error) {
        parentOfCreated++;
      }
      continue;
    }

    // For non-parent_of relationships, apply the secondary↔secondary filter
    const sourceIsPrimary = entityPrimaryMap.get(rel.source_name) ?? false;
    const targetIsPrimary = entityPrimaryMap.get(rel.target_name) ?? false;

    if (!sourceIsPrimary && !targetIsPrimary) {
      console.log(
        `Skipping secondary↔secondary relationship: ${rel.source_name} → ${rel.target_name}`
      );
      continue;
    }

    // Upsert relationship (ignore if already exists)
    await supabase.from("relationships").upsert(
      {
        source_entity_id: sourceId,
        target_entity_id: targetId,
        relationship_type: rel.relationship_type,
        article_id: articleId,
      },
      {
        onConflict: "source_entity_id,target_entity_id,relationship_type",
        ignoreDuplicates: true,
      }
    );
  }

  return { parentOfCreated, cyclesRejected };
}

/**
 * Create entity mentions linking articles to entities.
 */
export async function createEntityMentions(
  supabase: SupabaseClient,
  entityIds: string[],
  articleId: string
): Promise<void> {
  const mentions = entityIds.map((entityId) => ({
    entity_id: entityId,
    article_id: articleId,
  }));

  // Upsert to handle duplicates
  await supabase.from("entity_mentions").upsert(mentions, {
    onConflict: "entity_id,article_id",
    ignoreDuplicates: true,
  });
}
