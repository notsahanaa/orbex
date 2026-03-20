"use client";

import { useState, useEffect } from "react";

interface Subscription {
  id: string;
  name: string;
  feed_url: string;
  is_active: boolean;
  last_polled_at: string | null;
  error_count: number;
  created_at: string;
  article_count: number;
  relevant_count: number;
}

interface MySubscriptionsProps {
  subscriptions: Subscription[];
  loading: boolean;
  onRefresh: () => void;
  onAddFeed: () => void;
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${Math.floor(diffDays / 30)}mo`;
}

export function MySubscriptions({
  subscriptions,
  loading,
  onRefresh,
  onAddFeed,
}: MySubscriptionsProps) {
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollSuccess, setPollSuccess] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuOpenId) setMenuOpenId(null);
    };

    if (menuOpenId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [menuOpenId]);

  const handlePollAll = async () => {
    setPolling(true);
    setPollError(null);
    setPollSuccess(null);

    try {
      const response = await fetch("/api/subscriptions/poll", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to poll subscriptions");
      }

      const { articlesFound, newArticles, relevantArticles } = result.data;
      setPollSuccess(
        `Found ${articlesFound} articles (${newArticles} new, ${relevantArticles} relevant)`
      );

      onRefresh();

      setTimeout(() => setPollSuccess(null), 5000);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Failed to poll subscriptions");
    } finally {
      setPolling(false);
    }
  };

  const handleToggleActive = async (id: string, currentlyActive: boolean) => {
    setUpdatingId(id);
    setMenuOpenId(null);

    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to update subscription");
      }

      onRefresh();
    } catch (err) {
      console.error("Toggle active failed:", err);
      alert(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
    setMenuOpenId(null);
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }

    setUpdatingId(id);

    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to rename subscription");
      }

      onRefresh();
    } catch (err) {
      console.error("Rename failed:", err);
      alert(err instanceof Error ? err.message : "Failed to rename subscription");
    } finally {
      setUpdatingId(null);
      setRenamingId(null);
      setRenameValue("");
    }
  };

  const handleDeleteSubscription = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Delete subscription "${name}"?\n\nThis will remove the subscription but keep ingested articles.`
    );

    if (!confirmed) return;

    setUpdatingId(id);
    setMenuOpenId(null);

    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to delete subscription");
      }

      onRefresh();
    } catch (err) {
      console.error("Delete subscription failed:", err);
      alert(err instanceof Error ? err.message : "Failed to delete subscription");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-text-tertiary text-sm py-4">Loading subscriptions...</div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-tertiary text-sm mb-4">
          No subscriptions yet. Add an RSS feed to get started.
        </p>
        <button onClick={onAddFeed} className="btn btn-primary text-sm">
          + Add Custom Feed
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className={`flex items-center gap-4 py-3 px-4 rounded-md border transition-colors ${
              sub.is_active
                ? "border-border-subtle bg-bg-primary"
                : "border-border-subtle bg-bg-primary opacity-60"
            }`}
          >
            {/* Name and status */}
            <div className="flex-1 min-w-0">
              {renamingId === sub.id ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(sub.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(sub.id);
                    if (e.key === "Escape") {
                      setRenamingId(null);
                      setRenameValue("");
                    }
                  }}
                  autoFocus
                  className="input text-sm w-full"
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium truncate">
                      {sub.name}
                    </span>
                    <span className="text-text-tertiary text-xs">RSS</span>
                    {!sub.is_active && (
                      <span className="text-text-tertiary text-xs">(Paused)</span>
                    )}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">
                    {sub.article_count} articles · {sub.relevant_count} relevant
                    {sub.last_polled_at && (
                      <span className="ml-2">
                        Last checked: {getRelativeTime(sub.last_polled_at)} ago
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Menu button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === sub.id ? null : sub.id);
                }}
                disabled={updatingId === sub.id}
                className="text-text-tertiary hover:text-text-primary transition-colors p-1 disabled:opacity-50"
                title="Options"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {menuOpenId === sub.id && (
                <div
                  className="absolute right-0 top-8 bg-bg-primary border border-border-subtle rounded-md shadow-lg py-1 z-10 min-w-[140px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleToggleActive(sub.id, sub.is_active)}
                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-secondary transition-colors"
                  >
                    {sub.is_active ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => handleStartRename(sub.id, sub.name)}
                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-secondary transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDeleteSubscription(sub.id, sub.name)}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-bg-secondary transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handlePollAll}
          disabled={polling}
          className="btn btn-solid text-sm"
        >
          {polling ? "Polling..." : "Refresh All"}
        </button>
        <button onClick={onAddFeed} className="btn text-sm">
          + Add Custom Feed
        </button>
        {pollSuccess && (
          <span className="text-sm text-green-500">{pollSuccess}</span>
        )}
        {pollError && <span className="text-sm text-red-500">{pollError}</span>}
      </div>
    </div>
  );
}
