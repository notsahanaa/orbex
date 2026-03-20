"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { GraphNode, GraphLink, GraphData } from "@/types/graph";
import { EntityType } from "@/lib/extraction/schema";
import GraphFilters from "./GraphFilters";
import NodePanel from "./NodePanel";

// Dynamic import to avoid SSR issues with canvas
const GraphCanvas = dynamic(() => import("./GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-bg-primary">
      <div className="text-text-tertiary">Loading graph...</div>
    </div>
  ),
});

const ALL_TYPES: EntityType[] = [
  "paradigm",
  "tool",
  "company",
  "case_study",
  "event",
];

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeTypes, setActiveTypes] = useState<EntityType[]>(ALL_TYPES);
  const [highlightedSources, setHighlightedSources] = useState<string[]>([]);

  // Fetch graph data
  useEffect(() => {
    const fetchGraph = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/graph");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to fetch graph");
        }

        setGraphData(result.data);
        // Initialize highlightedSources to all sources (default: no specific highlighting)
        setHighlightedSources(result.data.availableSources || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, []);

  // All nodes are always visible (type filter affects opacity, not visibility)
  const allNodes = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes;
  }, [graphData]);

  // All links are always visible
  const allLinks = useMemo(() => {
    if (!graphData) return [];
    return graphData.links;
  }, [graphData]);

  // Calculate highlighted nodes (selected + connected + source-highlighted)
  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<string>();

    // If a node is selected, highlight it and connected nodes
    if (selectedNode) {
      ids.add(selectedNode.id);

      allLinks.forEach((link) => {
        const sourceId =
          typeof link.source === "object"
            ? (link.source as { id: string }).id
            : link.source;
        const targetId =
          typeof link.target === "object"
            ? (link.target as { id: string }).id
            : link.target;

        if (sourceId === selectedNode.id) {
          ids.add(targetId);
        } else if (targetId === selectedNode.id) {
          ids.add(sourceId);
        }
      });
    }

    // If specific sources are selected (not all), highlight nodes from those sources
    const allSourcesSelected =
      highlightedSources.length === graphData?.availableSources.length;
    if (!allSourcesSelected && highlightedSources.length > 0) {
      allNodes.forEach((node) => {
        if (node.sources.some((s) => highlightedSources.includes(s))) {
          ids.add(node.id);
        }
      });
    }

    return ids;
  }, [selectedNode, allLinks, highlightedSources, graphData, allNodes]);

  const handleToggleType = useCallback((type: EntityType) => {
    setActiveTypes((prev) => {
      if (prev.includes(type)) {
        // Don't allow deselecting all types
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }, []);

  const handleToggleSourceHighlight = useCallback((source: string) => {
    setHighlightedSources((prev) => {
      if (prev.includes(source)) {
        // Don't allow deselecting all sources
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== source);
      }
      return [...prev, source];
    });
  }, []);

  const handleClearSourceHighlight = useCallback(() => {
    if (!graphData) return;
    // Reset to all sources selected (no highlighting)
    setHighlightedSources(graphData.availableSources);
  }, [graphData]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleSelectNodeFromPanel = useCallback(
    (nodeId: string) => {
      const node = allNodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
      }
    },
    [allNodes]
  );

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg-primary">
        <div className="text-text-tertiary">Loading knowledge graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg-primary">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-bg-primary gap-4">
        <div className="text-text-tertiary">No entities yet</div>
        <p className="text-text-tertiary text-sm max-w-md text-center">
          Ingest some articles to start building your knowledge graph.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg-primary">
      {/* Filters */}
      <div className="p-4 border-b border-border-subtle">
        <GraphFilters
          activeTypes={activeTypes}
          onToggleType={handleToggleType}
          availableSources={graphData?.availableSources || []}
          highlightedSources={highlightedSources}
          onToggleSourceHighlight={handleToggleSourceHighlight}
          onClearSourceHighlight={handleClearSourceHighlight}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Graph - shrinks to 70% when panel is open */}
        <div
          className={`
            min-w-0 transition-all duration-200 ease-out
            ${selectedNode ? "w-[70%]" : "w-full"}
          `}
        >
          <GraphCanvas
            nodes={allNodes}
            links={allLinks}
            maxDepth={graphData?.max_depth ?? 3}
            selectedNodeId={selectedNode?.id || null}
            highlightedNodeIds={highlightedNodeIds}
            activeTypes={activeTypes}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
          />
        </div>

        {/* Side panel - slides in from right */}
        {selectedNode && (
          <NodePanel
            node={selectedNode}
            links={allLinks}
            allNodes={allNodes}
            onClose={() => setSelectedNode(null)}
            onSelectNode={handleSelectNodeFromPanel}
          />
        )}
      </div>

      {/* Stats bar */}
      <div className="px-4 py-2 border-t border-border-subtle text-xs text-text-tertiary">
        {allNodes.length} nodes · {allLinks.length} connections
      </div>
    </div>
  );
}
