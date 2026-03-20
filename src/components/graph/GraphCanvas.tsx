"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceCollide } from "d3-force";
import { GraphNode, GraphLink, ENTITY_COLORS, getNodeSize } from "@/types/graph";
import { EntityType } from "@/lib/extraction/schema";

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  maxDepth: number;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  activeTypes: EntityType[];
  onNodeClick: (node: GraphNode) => void;
  onBackgroundClick: () => void;
}

// Extended node type with position data
interface PositionedNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

const ALL_TYPES: EntityType[] = ["paradigm", "tool", "company", "case_study", "event"];

export default function GraphCanvas({
  nodes,
  links,
  maxDepth,
  selectedNodeId,
  highlightedNodeIds,
  activeTypes,
  onNodeClick,
  onBackgroundClick,
}: GraphCanvasProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Memoize graph data to prevent unnecessary re-simulation
  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  // Configure d3 forces on mount
  useEffect(() => {
    if (!graphRef.current) return;

    // Configure link force - moderate distance for balanced spacing
    const linkForce = graphRef.current.d3Force('link');
    linkForce?.distance(80).strength(0.6);

    // Configure charge force (repulsion between nodes)
    const chargeForce = graphRef.current.d3Force('charge');
    chargeForce?.strength(-200).distanceMax(400);

    // Weaken center force slightly to allow some spread
    const centerForce = graphRef.current.d3Force('center');
    if (centerForce && typeof centerForce.strength === 'function') {
      centerForce.strength(0.05);
    }

    // Add collision force to prevent node overlaps
    graphRef.current.d3Force(
      'collision',
      forceCollide<PositionedNode>()
        .radius((node) => getNodeSize(node, maxDepth) + 5)
        .strength(0.8)
    );
  }, [maxDepth]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Center graph on mount
  useEffect(() => {
    if (graphRef.current && nodes.length > 0) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50);
      }, 500);
    }
  }, [nodes.length]);


  const getNodeColor = useCallback(
    (node: GraphNode) => {
      const baseColor = ENTITY_COLORS[node.type];
      const hasHighlight = highlightedNodeIds.size > 0 || selectedNodeId;

      if (!hasHighlight) {
        return baseColor;
      }

      if (node.id === selectedNodeId || highlightedNodeIds.has(node.id)) {
        return baseColor;
      }

      return `${baseColor}99`;
    },
    [selectedNodeId, highlightedNodeIds]
  );

  const getNodeOpacity = useCallback(
    (node: GraphNode) => {
      // Check if type filter is active (not all types selected)
      const typeFilterActive = activeTypes.length < ALL_TYPES.length;
      const nodeMatchesTypeFilter = activeTypes.includes(node.type);

      // If type filter is active and node doesn't match, fade to 20%
      if (typeFilterActive && !nodeMatchesTypeFilter) {
        return 0.2;
      }

      // Check for selection/source highlighting
      const hasHighlight = highlightedNodeIds.size > 0 || selectedNodeId;

      if (!hasHighlight) {
        return 1;
      }

      if (node.id === selectedNodeId || highlightedNodeIds.has(node.id)) {
        return 1;
      }

      // Fade non-related nodes to 20%
      return 0.2;
    },
    [selectedNodeId, highlightedNodeIds, activeTypes]
  );

  // Get link opacity based on whether it connects to selected/highlighted nodes
  const getLinkOpacity = useCallback(
    (link: GraphLink) => {
      // Get source and target IDs (handle both string and object forms)
      const sourceId = typeof link.source === 'object' ? (link.source as PositionedNode).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as PositionedNode).id : link.target;

      // When a node is selected, only show links directly connected to it
      if (selectedNodeId) {
        const connectsToSelected = sourceId === selectedNodeId || targetId === selectedNodeId;
        return connectsToSelected ? 1 : 0.2;
      }

      // For source filtering (no selection), show links between highlighted nodes
      if (highlightedNodeIds.size > 0) {
        const sourceHighlighted = highlightedNodeIds.has(sourceId);
        const targetHighlighted = highlightedNodeIds.has(targetId);
        return (sourceHighlighted && targetHighlighted) ? 1 : 0.2;
      }

      return 1;
    },
    [selectedNodeId, highlightedNodeIds]
  );

  const nodeCanvasObject = useCallback(
    (node: PositionedNode, ctx: CanvasRenderingContext2D) => {
      if (node.x === undefined || node.y === undefined) return;

      const size = getNodeSize(node, maxDepth);
      const color = getNodeColor(node);
      const opacity = getNodeOpacity(node);

      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.fill();

      const label = node.name;
      // Font size scales with node depth: root nodes get larger text
      const fontSize = Math.max(3, 4 - node.hierarchy_depth * 0.3);
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = opacity > 0.5 ? "#A1A1A1" : "#666666";
      ctx.globalAlpha = opacity;
      ctx.fillText(label, node.x, node.y + size + 2);

      ctx.globalAlpha = 1;
    },
    [getNodeColor, getNodeOpacity, maxDepth]
  );

  const handleNodeClick = useCallback(
    (node: PositionedNode) => {
      onNodeClick(node);

      if (graphRef.current && node.x !== undefined && node.y !== undefined) {
        graphRef.current.centerAt(node.x, node.y, 500);
      }
    },
    [onNodeClick]
  );

  // Custom link rendering with opacity support
  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D) => {
      // Handle both string and object forms of source/target
      const source = (typeof link.source === 'object' ? link.source : null) as PositionedNode | null;
      const target = (typeof link.target === 'object' ? link.target : null) as PositionedNode | null;

      if (!source || !target ||
          source.x === undefined || source.y === undefined ||
          target.x === undefined || target.y === undefined) {
        return;
      }

      const opacity = getLinkOpacity(link);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = `rgba(102, 102, 102, ${opacity})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
    [getLinkOpacity]
  );

  return (
    <div ref={containerRef} className="w-full h-full bg-bg-primary">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#000000"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: PositionedNode, color, ctx) => {
          if (node.x === undefined || node.y === undefined) return;
          const size = getNodeSize(node, maxDepth);
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => "replace"}
        onNodeClick={handleNodeClick}
        onBackgroundClick={onBackgroundClick}
        // Simulation timing - let it run for 3 seconds then stop
        cooldownTicks={Infinity}
        cooldownTime={3000}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
        // Keep interactions enabled
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
