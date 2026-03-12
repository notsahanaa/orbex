"use client";

import { useState, useRef, useEffect } from "react";

interface SourceFilterProps {
  availableSources: string[];
  highlightedSources: string[];
  onToggleSourceHighlight: (source: string) => void;
  onClearHighlight: () => void;
}

export default function SourceFilter({
  availableSources,
  highlightedSources,
  onToggleSourceHighlight,
  onClearHighlight,
}: SourceFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = highlightedSources.length === availableSources.length;
  const noneSelected = highlightedSources.length === 0;
  const someSelected = !allSelected && !noneSelected;

  // Display text for the button
  const buttonText = allSelected
    ? "All sources"
    : highlightedSources.length === 1
      ? highlightedSources[0]
      : `${highlightedSources.length} sources`;

  if (availableSources.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          px-3 py-1.5 rounded-md text-xs font-mono transition-all
          border border-border-subtle
          flex items-center gap-2
          ${isOpen ? "bg-bg-secondary text-text-primary" : "text-text-secondary hover:text-text-primary"}
        `}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <span>{buttonText}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-bg-secondary border border-border-subtle rounded-md shadow-lg z-50">
          {/* Select All option (clears highlighting) */}
          <button
            onClick={onClearHighlight}
            className="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 hover:bg-bg-tertiary border-b border-border-subtle"
          >
            <span
              className={`
                w-4 h-4 rounded border flex items-center justify-center
                ${allSelected ? "bg-accent-primary border-accent-primary" : "border-border-subtle"}
                ${someSelected ? "bg-accent-primary/50 border-accent-primary" : ""}
              `}
            >
              {(allSelected || someSelected) && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {allSelected ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 12h14"
                    />
                  )}
                </svg>
              )}
            </span>
            <span className="text-text-primary">All sources</span>
          </button>

          {/* Individual sources */}
          <div className="max-h-[240px] overflow-y-auto">
            {availableSources.map((source) => {
              const isActive = highlightedSources.includes(source);
              return (
                <button
                  key={source}
                  onClick={() => onToggleSourceHighlight(source)}
                  className="w-full px-3 py-2 text-left text-xs font-mono flex items-center gap-2 hover:bg-bg-tertiary"
                >
                  <span
                    className={`
                      w-4 h-4 rounded border flex items-center justify-center transition-colors
                      ${isActive ? "bg-accent-primary border-accent-primary" : "border-border-subtle"}
                    `}
                  >
                    {isActive && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </span>
                  <span
                    className={
                      isActive ? "text-text-primary" : "text-text-tertiary"
                    }
                  >
                    {source}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
