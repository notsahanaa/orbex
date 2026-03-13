"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { GraphNode, GraphLink, ENTITY_COLORS, getNodeSize } from "@/types/graph";

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  maxDepth: number;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
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

export default function GraphCanvas({
  nodes,
  links,
  maxDepth,
  selectedNodeId,
  highlightedNodeIds,
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

    // Configure link force for proper clustering
    const linkForce = graphRef.current.d3Force('link');
    linkForce?.distance(50).strength(0.7);

    // Configure charge force (repulsion between nodes)
    const chargeForce = graphRef.current.d3Force('charge');
    chargeForce?.strength(-120).distanceMax(300);
  }, []);

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
      const hasHighlight = highlightedNodeIds.size > 0 || selectedNodeId;

      if (!hasHighlight) {
        return 1;
      }

      if (node.id === selectedNodeId || highlightedNodeIds.has(node.id)) {
        return 1;
      }

      return 0.6;
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
        linkColor={() => "#666666"}
        linkWidth={1.5}
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
