import { EntityType } from "@/lib/extraction/schema";

export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  is_primary: boolean;
  mention_count: number;
  sources: string[]; // Domain names of sources where this entity was mentioned
  updated_at: string | null; // Last time this entity was updated (new mention added)
  hierarchy_depth: number; // 0 = root, higher = deeper in the hierarchy
}

// Detailed node info fetched when a node is selected
export interface NodeSource {
  article_id: string;
  title: string;
  url: string;
  site_name: string | null;
  published_at: string;
  context: string | null; // Extracted content snippet for this entity
}

export interface NodeDetails {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  is_primary: boolean;
  mention_count: number;
  connected_count: number;
  updated_at: string | null;
  sources: NodeSource[];
}

export interface GraphLink {
  source: string;
  target: string;
  relationship_type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  availableSources: string[]; // All unique source domains across all entities
  max_depth: number; // Maximum hierarchy depth in the graph
}

export const ENTITY_COLORS: Record<EntityType, string> = {
  paradigm: "#8B5CF6", // Purple
  tool: "#10B981", // Emerald
  company: "#3B82F6", // Blue
  case_study: "#6B7280", // Gray
  event: "#6B7280", // Gray
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  paradigm: "Paradigm",
  tool: "Tool",
  company: "Company",
  case_study: "Case Study",
  event: "Event",
};

/**
 * Calculate node size based on hierarchy depth and mention count.
 * Root nodes (depth 0) are largest, deeper nodes are progressively smaller.
 */
export function getNodeSize(node: GraphNode, maxDepth: number = 3): number {
  const baseSize = 4; // Smaller base size for better spacing
  // Depth-based: roots are larger, deeper nodes are smaller
  const depthMultiplier = Math.pow(1.3, Math.max(0, maxDepth - node.hierarchy_depth));
  // Gentle mention scaling
  const mentionScale = 1 + Math.log10(Math.max(1, node.mention_count)) * 0.3;
  // Cap the max size to prevent oversized nodes
  return Math.min(baseSize * depthMultiplier * mentionScale, 15);
}
