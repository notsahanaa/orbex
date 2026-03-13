import { SupabaseClient } from "@supabase/supabase-js";
import { DbRelationship } from "./schema";

const PARENT_OF_TYPE = "parent_of";

/**
 * Check if adding a parent_of relationship would create a cycle.
 * A cycle exists if the proposed child is already an ancestor of the proposed parent.
 */
export async function wouldCreateCycle(
  supabase: SupabaseClient,
  parentId: string,
  childId: string,
  userId: string
): Promise<boolean> {
  // If parent and child are the same, it's a cycle
  if (parentId === childId) {
    return true;
  }

  // Get all ancestors of the proposed parent
  const ancestors = await getAncestors(supabase, parentId, userId);

  // If the proposed child is an ancestor of the parent, adding this would create a cycle
  return ancestors.has(childId);
}

/**
 * Get all ancestors of an entity (for cycle detection).
 * Returns a Set of entity IDs that are ancestors (directly or transitively).
 */
export async function getAncestors(
  supabase: SupabaseClient,
  entityId: string,
  userId: string
): Promise<Set<string>> {
  const ancestors = new Set<string>();
  const toProcess = [entityId];
  const visited = new Set<string>();

  while (toProcess.length > 0) {
    const currentId = toProcess.pop()!;

    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    // Find all entities that are parents of the current entity
    // parent_of: source is parent, target is child
    // So we look for relationships where target_entity_id = currentId
    const { data: parentRelationships } = await supabase
      .from("relationships")
      .select("source_entity_id, target_entity_id")
      .eq("target_entity_id", currentId)
      .eq("relationship_type", PARENT_OF_TYPE);

    if (parentRelationships) {
      for (const rel of parentRelationships) {
        if (!ancestors.has(rel.source_entity_id)) {
          ancestors.add(rel.source_entity_id);
          toProcess.push(rel.source_entity_id);
        }
      }
    }
  }

  return ancestors;
}

/**
 * Get all descendants of an entity.
 * Returns a Set of entity IDs that are descendants (directly or transitively).
 */
export async function getDescendants(
  supabase: SupabaseClient,
  entityId: string,
  userId: string
): Promise<Set<string>> {
  const descendants = new Set<string>();
  const toProcess = [entityId];
  const visited = new Set<string>();

  while (toProcess.length > 0) {
    const currentId = toProcess.pop()!;

    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    // Find all entities that are children of the current entity
    // parent_of: source is parent, target is child
    // So we look for relationships where source_entity_id = currentId
    const { data: childRelationships } = await supabase
      .from("relationships")
      .select("source_entity_id, target_entity_id")
      .eq("source_entity_id", currentId)
      .eq("relationship_type", PARENT_OF_TYPE);

    if (childRelationships) {
      for (const rel of childRelationships) {
        if (!descendants.has(rel.target_entity_id)) {
          descendants.add(rel.target_entity_id);
          toProcess.push(rel.target_entity_id);
        }
      }
    }
  }

  return descendants;
}

/**
 * Returns max depth from any root (0 = root, 1 = has parent, etc.)
 * Depth is the longest path from any root to this entity.
 */
export async function getEntityDepth(
  supabase: SupabaseClient,
  entityId: string,
  userId: string
): Promise<number> {
  const visited = new Set<string>();

  async function computeDepth(id: string): Promise<number> {
    if (visited.has(id)) {
      // Cycle detected (shouldn't happen with valid DAG)
      return 0;
    }
    visited.add(id);

    // Find all parents of this entity
    const { data: parentRelationships } = await supabase
      .from("relationships")
      .select("source_entity_id")
      .eq("target_entity_id", id)
      .eq("relationship_type", PARENT_OF_TYPE);

    if (!parentRelationships || parentRelationships.length === 0) {
      // No parents = root node = depth 0
      return 0;
    }

    // Depth is 1 + max depth of any parent
    let maxParentDepth = 0;
    for (const rel of parentRelationships) {
      const parentDepth = await computeDepth(rel.source_entity_id);
      maxParentDepth = Math.max(maxParentDepth, parentDepth);
    }

    return maxParentDepth + 1;
  }

  return computeDepth(entityId);
}

/**
 * Returns true if entity has no incoming parent_of relationships (is a root).
 */
export async function isRootEntity(
  supabase: SupabaseClient,
  entityId: string
): Promise<boolean> {
  const { data: parentRelationships, count } = await supabase
    .from("relationships")
    .select("id", { count: "exact", head: true })
    .eq("target_entity_id", entityId)
    .eq("relationship_type", PARENT_OF_TYPE);

  return count === 0;
}

/**
 * Check if a relationship is a parent_of relationship.
 */
export function isParentOfRelationship(relationshipType: string): boolean {
  return relationshipType.toLowerCase() === PARENT_OF_TYPE;
}

/**
 * Recalculate is_primary for all entities affected by parent_of relationships.
 *
 * New logic:
 * - is_primary = (type in [paradigm, tool, company]) AND (has no incoming parent_of relationship)
 * - case_study and event are always is_primary = false
 */
export async function recalculateIsPrimary(
  supabase: SupabaseClient,
  userId: string
): Promise<{ updated: number }> {
  // Get all entities that are children (targets of parent_of relationships)
  const { data: childRelationships } = await supabase
    .from("relationships")
    .select("target_entity_id")
    .eq("relationship_type", PARENT_OF_TYPE);

  if (!childRelationships || childRelationships.length === 0) {
    return { updated: 0 };
  }

  const childEntityIds = [...new Set(childRelationships.map(r => r.target_entity_id))];

  // Update these entities to is_primary = false, but only if they're paradigm/tool/company
  // (case_study and event are already false)
  const { data: updated, error } = await supabase
    .from("entities")
    .update({ is_primary: false })
    .in("id", childEntityIds)
    .eq("user_id", userId)
    .in("type", ["paradigm", "tool", "company"])
    .eq("is_primary", true) // Only update if currently true
    .select("id");

  if (error) {
    console.error("Error recalculating is_primary:", error);
    throw error;
  }

  return { updated: updated?.length ?? 0 };
}
