import { SupabaseClient } from "@supabase/supabase-js";
import { DbEntity } from "./schema";
import { normalizeEntityName } from "./normalize";

const PARENT_OF_TYPE = "parent_of";

/**
 * Represents a node in the paradigm tree.
 */
export interface ParadigmTreeNode {
  id: string;
  name: string;
  description: string | null;
  children: ParadigmTreeNode[];
  depth: number;
}

/**
 * Represents the full paradigm tree structure.
 */
export interface ParadigmTree {
  roots: ParadigmTreeNode[];
  nodeCount: number;
  maxDepth: number;
}

/**
 * Entity with its paradigm attachment info.
 */
export interface SubtreeEntity extends DbEntity {
  paradigm_id: string;
  paradigm_name: string;
}

/**
 * Get the full paradigm tree for a user.
 * Returns all paradigm entities organized as a tree structure.
 */
export async function getParadigmTree(
  supabase: SupabaseClient,
  userId: string
): Promise<ParadigmTree> {
  // Fetch all paradigm entities
  const { data: paradigms, error: paradigmsError } = await supabase
    .from("entities")
    .select("id, name, description")
    .eq("user_id", userId)
    .eq("type", "paradigm");

  if (paradigmsError) {
    throw new Error(`Failed to fetch paradigms: ${paradigmsError.message}`);
  }

  if (!paradigms || paradigms.length === 0) {
    return { roots: [], nodeCount: 0, maxDepth: 0 };
  }

  // Fetch all parent_of relationships between paradigms
  const paradigmIds = paradigms.map((p) => p.id);
  const { data: relationships, error: relError } = await supabase
    .from("relationships")
    .select("source_entity_id, target_entity_id")
    .eq("relationship_type", PARENT_OF_TYPE)
    .in("source_entity_id", paradigmIds)
    .in("target_entity_id", paradigmIds);

  if (relError) {
    throw new Error(`Failed to fetch relationships: ${relError.message}`);
  }

  // Build parent->children map
  const childrenMap = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const rel of relationships || []) {
    if (!childrenMap.has(rel.source_entity_id)) {
      childrenMap.set(rel.source_entity_id, []);
    }
    childrenMap.get(rel.source_entity_id)!.push(rel.target_entity_id);
    hasParent.add(rel.target_entity_id);
  }

  // Build id->paradigm map
  const paradigmMap = new Map(paradigms.map((p) => [p.id, p]));

  // Recursively build tree nodes
  function buildNode(id: string, depth: number): ParadigmTreeNode {
    const paradigm = paradigmMap.get(id)!;
    const childIds = childrenMap.get(id) || [];
    return {
      id,
      name: paradigm.name,
      description: paradigm.description,
      depth,
      children: childIds.map((childId) => buildNode(childId, depth + 1)),
    };
  }

  // Find root paradigms (no incoming parent_of from another paradigm)
  const rootParadigms = paradigms.filter((p) => !hasParent.has(p.id));
  const roots = rootParadigms.map((p) => buildNode(p.id, 0));

  // Calculate max depth
  function getMaxDepth(node: ParadigmTreeNode): number {
    if (node.children.length === 0) return node.depth;
    return Math.max(...node.children.map(getMaxDepth));
  }
  const maxDepth = roots.length > 0 ? Math.max(...roots.map(getMaxDepth)) : 0;

  return {
    roots,
    nodeCount: paradigms.length,
    maxDepth,
  };
}

/**
 * Format the paradigm tree as a simple string for LLM prompts.
 * Uses indentation to show hierarchy.
 */
export function formatParadigmTreeForPrompt(tree: ParadigmTree): string {
  if (tree.roots.length === 0) {
    return "No existing paradigms in the knowledge graph.";
  }

  const lines: string[] = [];

  function formatNode(node: ParadigmTreeNode, indent: number): void {
    const prefix = "  ".repeat(indent);
    lines.push(`${prefix}- ${node.name} (id: ${node.id})`);
    for (const child of node.children) {
      formatNode(child, indent + 1);
    }
  }

  for (const root of tree.roots) {
    formatNode(root, 0);
  }

  return lines.join("\n");
}

/**
 * Check if a paradigm is a leaf (has no paradigm children).
 */
export async function isLeafParadigm(
  supabase: SupabaseClient,
  paradigmId: string,
  userId: string
): Promise<boolean> {
  // Get children of this paradigm that are also paradigms
  const { data: childRelationships } = await supabase
    .from("relationships")
    .select("target_entity_id")
    .eq("source_entity_id", paradigmId)
    .eq("relationship_type", PARENT_OF_TYPE);

  if (!childRelationships || childRelationships.length === 0) {
    return true;
  }

  // Check if any of these children are paradigms
  const childIds = childRelationships.map((r) => r.target_entity_id);
  const { data: paradigmChildren, count } = await supabase
    .from("entities")
    .select("id", { count: "exact", head: true })
    .in("id", childIds)
    .eq("type", "paradigm")
    .eq("user_id", userId);

  return (count ?? 0) === 0;
}

/**
 * Get all leaf paradigm IDs from a subtree starting at the given paradigm.
 */
export async function getLeafParadigmsInSubtree(
  supabase: SupabaseClient,
  paradigmId: string,
  userId: string
): Promise<string[]> {
  const leaves: string[] = [];
  const visited = new Set<string>();

  async function traverse(id: string): Promise<void> {
    if (visited.has(id)) return;
    visited.add(id);

    // Get paradigm children
    const { data: childRelationships } = await supabase
      .from("relationships")
      .select("target_entity_id")
      .eq("source_entity_id", id)
      .eq("relationship_type", PARENT_OF_TYPE);

    const childIds = childRelationships?.map((r) => r.target_entity_id) || [];

    // Filter to only paradigm children
    if (childIds.length > 0) {
      const { data: paradigmChildren } = await supabase
        .from("entities")
        .select("id")
        .in("id", childIds)
        .eq("type", "paradigm")
        .eq("user_id", userId);

      const paradigmChildIds = paradigmChildren?.map((p) => p.id) || [];

      if (paradigmChildIds.length === 0) {
        // No paradigm children = this is a leaf
        leaves.push(id);
      } else {
        // Recurse into paradigm children
        for (const childId of paradigmChildIds) {
          await traverse(childId);
        }
      }
    } else {
      // No children at all = leaf
      leaves.push(id);
    }
  }

  await traverse(paradigmId);
  return leaves;
}

/**
 * Get all entities under a paradigm subtree.
 * This includes all tools, companies, events, and case studies attached to
 * any paradigm in the subtree (at leaf level or anywhere in the hierarchy).
 */
export async function getSubtreeEntities(
  supabase: SupabaseClient,
  paradigmId: string,
  userId: string
): Promise<SubtreeEntity[]> {
  // Get all paradigms in the subtree (including the root)
  const subtreeParadigmIds = await getAllSubtreeParadigms(
    supabase,
    paradigmId,
    userId
  );
  subtreeParadigmIds.push(paradigmId);

  // Get all non-paradigm entities attached to these paradigms
  // They're attached via parent_of relationships (paradigm is parent, entity is child)
  const { data: attachedRelationships } = await supabase
    .from("relationships")
    .select("source_entity_id, target_entity_id")
    .eq("relationship_type", PARENT_OF_TYPE)
    .in("source_entity_id", subtreeParadigmIds);

  if (!attachedRelationships || attachedRelationships.length === 0) {
    return [];
  }

  // Get the entities that are children of these paradigms
  const childIds = attachedRelationships.map((r) => r.target_entity_id);
  const { data: entities } = await supabase
    .from("entities")
    .select("*")
    .in("id", childIds)
    .neq("type", "paradigm") // Exclude paradigms, we want attached entities
    .eq("user_id", userId);

  if (!entities) return [];

  // Build a map of entity ID -> paradigm ID for attachment info
  const entityToParadigm = new Map<string, string>();
  for (const rel of attachedRelationships) {
    // If entity has multiple paradigm parents, just keep the first one for now
    if (!entityToParadigm.has(rel.target_entity_id)) {
      entityToParadigm.set(rel.target_entity_id, rel.source_entity_id);
    }
  }

  // Get paradigm names
  const { data: paradigms } = await supabase
    .from("entities")
    .select("id, name")
    .in("id", subtreeParadigmIds);

  const paradigmNames = new Map(paradigms?.map((p) => [p.id, p.name]) || []);

  return entities.map((e) => {
    const paradigmId = entityToParadigm.get(e.id) || "";
    return {
      ...e,
      paradigm_id: paradigmId,
      paradigm_name: paradigmNames.get(paradigmId) || "",
    };
  });
}

/**
 * Get all paradigm IDs in a subtree (excluding the root).
 */
async function getAllSubtreeParadigms(
  supabase: SupabaseClient,
  rootId: string,
  userId: string
): Promise<string[]> {
  const subtreeIds: string[] = [];
  const toProcess = [rootId];
  const visited = new Set<string>();

  while (toProcess.length > 0) {
    const currentId = toProcess.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Get children of this paradigm
    const { data: childRelationships } = await supabase
      .from("relationships")
      .select("target_entity_id")
      .eq("source_entity_id", currentId)
      .eq("relationship_type", PARENT_OF_TYPE);

    if (!childRelationships) continue;

    const childIds = childRelationships.map((r) => r.target_entity_id);
    if (childIds.length === 0) continue;

    // Filter to paradigms only
    const { data: paradigmChildren } = await supabase
      .from("entities")
      .select("id")
      .in("id", childIds)
      .eq("type", "paradigm")
      .eq("user_id", userId);

    for (const child of paradigmChildren || []) {
      if (currentId !== rootId || child.id !== rootId) {
        subtreeIds.push(child.id);
      }
      toProcess.push(child.id);
    }
  }

  return subtreeIds;
}

/**
 * Insert a new parent paradigm above an existing paradigm (re-rooting / upward growth).
 *
 * Before: L1: "Agentic coding tools"
 * After:  L1: "Agentic AI" (new) -> L2: "Agentic coding tools"
 */
export async function insertParentParadigm(
  supabase: SupabaseClient,
  childId: string,
  newParentName: string,
  newParentDescription: string,
  userId: string
): Promise<{ newParentId: string }> {
  const normalizedName = normalizeEntityName(newParentName);

  // Create the new parent paradigm
  const { data: newParent, error: createError } = await supabase
    .from("entities")
    .insert({
      name: newParentName,
      normalized_name: normalizedName,
      type: "paradigm",
      description: newParentDescription,
      is_primary: true, // New L1 paradigm is primary
      mention_count: 1,
      user_id: userId,
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create parent paradigm: ${createError.message}`);
  }

  // Get the child's current parents (if any)
  const { data: currentParents } = await supabase
    .from("relationships")
    .select("source_entity_id")
    .eq("target_entity_id", childId)
    .eq("relationship_type", PARENT_OF_TYPE);

  // If the child had parents, make those the grandparents of the new parent
  // (This maintains the existing hierarchy above)
  for (const parent of currentParents || []) {
    // Remove old parent -> child relationship
    await supabase
      .from("relationships")
      .delete()
      .eq("source_entity_id", parent.source_entity_id)
      .eq("target_entity_id", childId)
      .eq("relationship_type", PARENT_OF_TYPE);

    // Create grandparent -> new parent relationship
    await supabase.from("relationships").insert({
      source_entity_id: parent.source_entity_id,
      target_entity_id: newParent.id,
      relationship_type: PARENT_OF_TYPE,
    });
  }

  // Create new parent -> child relationship
  await supabase.from("relationships").insert({
    source_entity_id: newParent.id,
    target_entity_id: childId,
    relationship_type: PARENT_OF_TYPE,
  });

  return { newParentId: newParent.id };
}

/**
 * Get the depth of a paradigm (0 = L1 root, 1 = L2, 2 = L3, etc.)
 * Walks up the parent_of relationships to find the root.
 */
export async function getParadigmDepth(
  supabase: SupabaseClient,
  paradigmId: string
): Promise<number> {
  let depth = 0;
  let currentId = paradigmId;

  while (true) {
    const { data: parent } = await supabase
      .from("relationships")
      .select("source_entity_id")
      .eq("target_entity_id", currentId)
      .eq("relationship_type", PARENT_OF_TYPE)
      .single();

    if (!parent) break;
    depth++;
    currentId = parent.source_entity_id;
  }

  return depth;
}

/**
 * Attach a tool/company/event/case_study to a paradigm.
 * Only attaches to L2+ paradigms (depth >= 1). L1 paradigms should only have paradigm children.
 *
 * @returns true if attachment was created, false if skipped (L1 paradigm)
 */
export async function attachEntityToParadigm(
  supabase: SupabaseClient,
  entityId: string,
  paradigmId: string,
  articleId?: string
): Promise<boolean> {
  // Check paradigm depth - only attach to L2+ (depth >= 1)
  const depth = await getParadigmDepth(supabase, paradigmId);
  if (depth < 1) {
    console.log(`Skipping attachment to L1 paradigm (depth=${depth})`);
    return false;
  }

  await supabase.from("relationships").upsert(
    {
      source_entity_id: paradigmId,
      target_entity_id: entityId,
      relationship_type: PARENT_OF_TYPE,
      article_id: articleId || null,
    },
    {
      onConflict: "source_entity_id,target_entity_id,relationship_type",
      ignoreDuplicates: true,
    }
  );

  return true;
}

/**
 * Find a paradigm by name.
 */
export async function findParadigmByName(
  supabase: SupabaseClient,
  name: string,
  userId: string
): Promise<DbEntity | null> {
  const normalizedName = normalizeEntityName(name);
  const { data } = await supabase
    .from("entities")
    .select("*")
    .eq("normalized_name", normalizedName)
    .eq("type", "paradigm")
    .eq("user_id", userId)
    .single();

  return data || null;
}

/**
 * Create a new paradigm entity.
 */
export async function createParadigm(
  supabase: SupabaseClient,
  name: string,
  description: string,
  userId: string,
  parentId?: string
): Promise<DbEntity> {
  const normalizedName = normalizeEntityName(name);

  const { data: newParadigm, error } = await supabase
    .from("entities")
    .insert({
      name,
      normalized_name: normalizedName,
      type: "paradigm",
      description,
      is_primary: !parentId, // Primary if it's a root (no parent)
      mention_count: 1,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create paradigm: ${error.message}`);
  }

  // If a parent is specified, create the relationship
  if (parentId) {
    await supabase.from("relationships").insert({
      source_entity_id: parentId,
      target_entity_id: newParadigm.id,
      relationship_type: PARENT_OF_TYPE,
    });
  }

  return newParadigm;
}
