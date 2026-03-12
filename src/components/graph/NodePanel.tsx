"use client";

import { useEffect, useState } from "react";
import {
  GraphNode,
  GraphLink,
  NodeDetails,
  ENTITY_COLORS,
  ENTITY_LABELS,
} from "@/types/graph";

interface NodePanelProps {
  node: GraphNode;
  links: GraphLink[];
  allNodes: GraphNode[];
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(dateString);
}

export default function NodePanel({
  node,
  links,
  allNodes,
  onClose,
  onSelectNode,
}: NodePanelProps) {
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  // Find connected nodes
  const connectedNodeIds = new Set<string>();
  links.forEach((link) => {
    const sourceId =
      typeof link.source === "object"
        ? (link.source as { id: string }).id
        : link.source;
    const targetId =
      typeof link.target === "object"
        ? (link.target as { id: string }).id
        : link.target;

    if (sourceId === node.id) {
      connectedNodeIds.add(targetId);
    } else if (targetId === node.id) {
      connectedNodeIds.add(sourceId);
    }
  });

  const connectedNodes = allNodes.filter((n) => connectedNodeIds.has(n.id));

  // Fetch node details
  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/graph/node/${node.id}`);
        const result = await response.json();
        if (result.success) {
          setDetails(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch node details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [node.id]);

  // Animate panel in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  return (
    <div
      className={`
        w-[30%] min-w-[320px] max-w-[480px] bg-bg-secondary border-l border-border-subtle
        h-full overflow-y-auto flex flex-col
        transition-transform duration-200 ease-out
        ${isVisible ? "translate-x-0" : "translate-x-full"}
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div
              className="text-xs font-mono uppercase tracking-wider mb-1"
              style={{ color: ENTITY_COLORS[node.type] }}
            >
              {ENTITY_LABELS[node.type]}
            </div>
            <h3 className="text-lg font-sans font-semibold text-text-primary truncate">
              {node.name}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-text-tertiary hover:text-text-primary p-1 flex-shrink-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
          <span>{connectedNodes.length} connected</span>
          <span className="text-border-subtle">|</span>
          <span>Updated {formatRelativeDate(details?.updated_at || node.updated_at)}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-text-tertiary">Loading...</div>
        ) : node.is_primary ? (
          <PrimaryNodeContent
            details={details}
            connectedNodes={connectedNodes}
            onSelectNode={onSelectNode}
          />
        ) : (
          <SecondaryNodeContent
            details={details}
            connectedNodes={connectedNodes}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </div>
  );
}

interface ContentProps {
  details: NodeDetails | null;
  connectedNodes: GraphNode[];
  onSelectNode: (nodeId: string) => void;
}

function PrimaryNodeContent({
  details,
  connectedNodes,
  onSelectNode,
}: ContentProps) {
  // Get unique quotes from sources (context snippets)
  const quotes = details?.sources
    ?.filter((s) => s.context && s.context.length > 50)
    ?.slice(0, 3) || [];

  return (
    <>
      {/* Summary/Description */}
      <div className="p-4 border-b border-border-subtle">
        <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">
          Summary
        </div>

        {/* Main description */}
        {details?.description ? (
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            {details.description}
          </p>
        ) : (
          <p className="text-sm text-text-tertiary italic mb-4">
            No description available yet.
          </p>
        )}

        {/* Context from sources */}
        {quotes.length > 0 && (
          <div className="space-y-4">
            <div className="text-xs text-text-tertiary uppercase tracking-wider">
              From the sources
            </div>
            {quotes.map((source, idx) => (
              <div key={idx} className="relative">
                <div className="pl-3 border-l-2 border-border-subtle">
                  <p className="text-sm text-text-secondary leading-relaxed italic">
                    &ldquo;{source.context}&rdquo;
                  </p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-text-tertiary hover:text-text-secondary mt-2 inline-block"
                  >
                    — {source.site_name || new URL(source.url).hostname}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mention count context */}
        {details && details.mention_count > 1 && (
          <p className="text-xs text-text-tertiary mt-4">
            Mentioned in {details.mention_count} article{details.mention_count > 1 ? 's' : ''} across {details.sources?.length || 0} source{(details.sources?.length || 0) > 1 ? 's' : ''}.
          </p>
        )}
      </div>

      {/* Connected Nodes */}
      {connectedNodes.length > 0 && (
        <div className="p-4 border-b border-border-subtle">
          <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">
            Related ({connectedNodes.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedNodes.map((connectedNode) => (
              <button
                key={connectedNode.id}
                onClick={() => onSelectNode(connectedNode.id)}
                className="px-2 py-1 text-xs rounded border border-border-subtle
                         hover:border-border-hover transition-colors"
                style={{
                  color: ENTITY_COLORS[connectedNode.type],
                }}
              >
                {connectedNode.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {details?.sources && details.sources.length > 0 && (
        <div className="p-4">
          <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">
            Sources ({details.sources.length})
          </div>
          <div className="space-y-3">
            {details.sources.map((source) => (
              <a
                key={source.article_id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-md border border-border-subtle hover:border-border-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary font-medium truncate">
                      {source.title}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">
                      {source.site_name || new URL(source.url).hostname} | {formatDate(source.published_at)}
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SecondaryNodeContent({
  details,
  connectedNodes,
  onSelectNode,
}: ContentProps) {
  // Find primary nodes this secondary node connects to
  const primaryConnections = connectedNodes.filter((n) => n.is_primary);

  // Get the main quote/context from the first source
  const mainQuote = details?.sources?.find((s) => s.context && s.context.length > 50);

  return (
    <>
      {/* Summary with connection context */}
      <div className="p-4 border-b border-border-subtle">
        <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">
          Summary
        </div>

        {/* Main description */}
        {details?.description ? (
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            {details.description}
          </p>
        ) : (
          <p className="text-sm text-text-tertiary italic mb-4">
            No description available yet.
          </p>
        )}

        {/* Main quote from source */}
        {mainQuote && (
          <div className="mb-4">
            <div className="pl-3 border-l-2 border-border-subtle">
              <p className="text-sm text-text-secondary leading-relaxed italic">
                &ldquo;{mainQuote.context}&rdquo;
              </p>
              <a
                href={mainQuote.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-text-tertiary hover:text-text-secondary mt-2 inline-block"
              >
                — {mainQuote.site_name || new URL(mainQuote.url).hostname}
              </a>
            </div>
          </div>
        )}

        {/* Connection to primary nodes */}
        {primaryConnections.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">
              Related Concepts
            </div>
            <div className="flex flex-wrap gap-2">
              {primaryConnections.map((primaryNode) => (
                <button
                  key={primaryNode.id}
                  onClick={() => onSelectNode(primaryNode.id)}
                  className="px-2 py-1 text-xs rounded border border-border-subtle
                           hover:border-border-hover transition-colors"
                  style={{
                    color: ENTITY_COLORS[primaryNode.type],
                  }}
                >
                  {primaryNode.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Source Details with Context */}
      {details?.sources && details.sources.length > 0 && (
        <div className="p-4">
          <div className="text-xs text-text-tertiary uppercase tracking-wider mb-3">
            Source{details.sources.length > 1 ? "s" : ""} ({details.sources.length})
          </div>
          <div className="space-y-4">
            {details.sources.map((source) => (
              <div
                key={source.article_id}
                className="rounded-md border border-border-subtle overflow-hidden"
              >
                {/* Source header */}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 hover:bg-bg-tertiary transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary font-medium">
                        {source.title}
                      </div>
                      <div className="text-xs text-text-tertiary mt-1">
                        {source.site_name || new URL(source.url).hostname} | {formatDate(source.published_at)}
                      </div>
                    </div>
                    <svg
                      className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </div>
                </a>

                {/* Extracted context */}
                {source.context && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="p-2 bg-bg-tertiary rounded text-xs text-text-secondary leading-relaxed">
                      "{source.context}"
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
