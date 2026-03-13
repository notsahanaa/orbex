import { SupabaseClient } from "@supabase/supabase-js";
import { ExtractedEntity, DbEntity, EntityType } from "./schema";
import { normalizeEntityName, areNamesSimilar } from "./normalize";
import { wouldCreateCycle, isParentOfRelationship } from "./hierarchy";

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
 * 1. Exact match on normalized_name + type
 * 2. Fuzzy match on similar names of same type
 * 3. Create new if no match found
 */
export async function findOrCreateEntity(
  supabase: SupabaseClient,
  entity: ExtractedEntity,
  userId: string
): Promise<DeduplicationResult> {
  const normalizedName = normalizeEntityName(entity.name);

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

  // Step 3: No match found - create new entity
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

/**
 * Process all extracted entities from an article.
 * Returns a map of entity names to their database IDs.
 */
export async function processExtractedEntities(
  supabase: SupabaseClient,
  entities: ExtractedEntity[],
  userId: string
): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();

  for (const entity of entities) {
    const result = await findOrCreateEntity(supabase, entity, userId);
    nameToId.set(entity.name, result.entityId);
  }

  return nameToId;
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
