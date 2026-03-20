"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { GraphNode, GraphLink } from "@/types/graph";
import { EntityType } from "@/lib/extraction/schema";

// Dynamic import to avoid SSR issues with canvas
const GraphCanvas = dynamic(
  () => import("@/components/graph/GraphCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-bg-primary">
        <div className="text-text-tertiary">Loading graph...</div>
      </div>
    ),
  }
);

const ALL_TYPES: EntityType[] = [
  "paradigm",
  "tool",
  "company",
  "case_study",
  "event",
];

interface AskGraphProps {
  entityIds: string[];
  onNodeClick: (nodeName: string) => void;
  questionType: "main" | "subquestion";
}

interface EntityData {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  is_primary: boolean;
  mention_count: number;
}

interface RelationshipData {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
}

export default function AskGraph({
  entityIds,
  onNodeClick,
  questionType,
}: AskGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch entity and relationship data when entityIds change
  useEffect(() => {
    if (entityIds.length === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const fetchGraphData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch entities by IDs
        const response = await fetch("/api/entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: entityIds }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch entities");
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || "Unknown error");
        }

        const entities: EntityData[] = result.data.entities || [];
        const relationships: RelationshipData[] = result.data.relationships || [];

        // Transform to graph format
        const graphNodes: GraphNode[] = entities.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          is_primary: e.is_primary,
          mention_count: e.mention_count,
          sources: [],
          updated_at: null,
          hierarchy_depth: 0, // Flat for Ask view
        }));

        // Filter relationships to only those between fetched entities
        const entityIdSet = new Set(entityIds);
        const graphLinks: GraphLink[] = relationships
          .filter(
            (r) =>
              entityIdSet.has(r.source_entity_id) &&
              entityIdSet.has(r.target_entity_id)
          )
          .map((r) => ({
            source: r.source_entity_id,
            target: r.target_entity_id,
            relationship_type: r.relationship_type,
          }));

        setNodes(graphNodes);
        setLinks(graphLinks);
      } catch (err) {
        console.error("Error fetching graph data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchGraphData();
  }, [entityIds]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      onNodeClick(node.name);
    },
    [onNodeClick]
  );

  const handleBackgroundClick = useCallback(() => {
    // No action on background click in Ask view
  }, []);

  // Empty state
  if (entityIds.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center px-8">
        <div className="text-text-tertiary mb-2">
          Ask a question to see related entities
        </div>
        <p className="text-sm text-text-tertiary max-w-md">
          The graph will show entities mentioned in answers. Click on any node
          to ask a follow-up question.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg-primary">
        <div className="text-text-tertiary">Loading graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg-primary">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Graph header */}
      <div className="px-4 py-2 border-b border-border-subtle text-xs text-text-tertiary flex items-center justify-between">
        <span>
          {nodes.length} entities · {links.length} connections
        </span>
        <span className="text-text-tertiary">
          Click a node to ask about it
        </span>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 min-h-0">
        <GraphCanvas
          nodes={nodes}
          links={links}
          maxDepth={0}
          selectedNodeId={null}
          highlightedNodeIds={new Set()}
          activeTypes={ALL_TYPES}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
        />
      </div>
    </div>
  );
}
