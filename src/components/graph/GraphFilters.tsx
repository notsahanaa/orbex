"use client";

import { EntityType } from "@/lib/extraction/schema";
import { ENTITY_COLORS, ENTITY_LABELS } from "@/types/graph";
import SourceFilter from "./SourceFilter";

interface GraphFiltersProps {
  activeTypes: EntityType[];
  onToggleType: (type: EntityType) => void;
  availableSources: string[];
  highlightedSources: string[];
  onToggleSourceHighlight: (source: string) => void;
  onClearSourceHighlight: () => void;
}

const ALL_TYPES: EntityType[] = [
  "paradigm",
  "tool",
  "company",
  "case_study",
  "event",
];

export default function GraphFilters({
  activeTypes,
  onToggleType,
  availableSources,
  highlightedSources,
  onToggleSourceHighlight,
  onClearSourceHighlight,
}: GraphFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Entity type filters */}
      <div className="flex flex-wrap gap-2">
        {ALL_TYPES.map((type) => {
          const isActive = activeTypes.includes(type);
          const color = ENTITY_COLORS[type];

          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className={`
                px-3 py-1.5 rounded-md text-xs font-mono transition-all
                border
                ${
                  isActive
                    ? "border-current bg-opacity-20"
                    : "border-border-subtle text-text-tertiary hover:text-text-secondary"
                }
              `}
              style={{
                color: isActive ? color : undefined,
                backgroundColor: isActive ? `${color}20` : undefined,
                borderColor: isActive ? color : undefined,
              }}
            >
              {ENTITY_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      {availableSources.length > 0 && (
        <div className="h-6 w-px bg-border-subtle" />
      )}

      {/* Source filter (for highlighting) */}
      <SourceFilter
        availableSources={availableSources}
        highlightedSources={highlightedSources}
        onToggleSourceHighlight={onToggleSourceHighlight}
        onClearHighlight={onClearSourceHighlight}
      />
    </div>
  );
}
