"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import AskMessage from "./AskMessage";
import AskGraph from "./AskGraph";

interface ArticleHighlight {
  id: string;
  title: string;
  url: string;
  site_name: string | null;
  relevance_reason: string;
  highlights: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  articles?: ArticleHighlight[];
  entityIds?: string[];
  isLoading?: boolean;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AskChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentEntityIds, setCurrentEntityIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [currentQuestionType, setCurrentQuestionType] = useState<
    "main" | "subquestion"
  >("main");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const askQuestion = useCallback(
    async (question: string, isSubquestion: boolean = false) => {
      if (!question.trim() || isLoading) return;

      // For main questions, reset the graph
      if (!isSubquestion) {
        setCurrentEntityIds([]);
        setCurrentQuestionType("main");
      } else {
        setCurrentQuestionType("subquestion");
      }

      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();

      // Add user message
      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        content: question,
      };

      // Add placeholder assistant message
      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsLoading(true);

      try {
        // Build conversation history (exclude the placeholder)
        const conversationHistory: ConversationMessage[] = messages
          .filter((m) => !m.isLoading)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            conversation_history: conversationHistory,
            current_entity_ids: isSubquestion ? currentEntityIds : [],
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to get answer");
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Unknown error");
        }

        const { answer, graph } = result.data;

        // Update assistant message with response
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: answer.summary,
                  articles: answer.articles,
                  entityIds: graph.entity_ids,
                  isLoading: false,
                }
              : m
          )
        );

        // Update current entity IDs
        // For subquestions, merge; for main questions, replace
        if (isSubquestion) {
          setCurrentEntityIds((prev) => {
            const merged = new Set([...prev, ...graph.entity_ids]);
            return Array.from(merged);
          });
        } else {
          setCurrentEntityIds(graph.entity_ids);
        }
      } catch (error) {
        console.error("Ask error:", error);
        // Update placeholder with error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    "Sorry, I encountered an error while processing your question. Please try again.",
                  isLoading: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [messages, currentEntityIds, isLoading]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (inputValue.trim()) {
        askQuestion(inputValue, false);
        setInputValue("");
      }
    },
    [inputValue, askQuestion]
  );

  const handleNodeClick = useCallback(
    (nodeName: string) => {
      const subquestion = `Tell me more about ${nodeName}`;
      askQuestion(subquestion, true);
    },
    [askQuestion]
  );

  const handleNewQuestion = useCallback(() => {
    setMessages([]);
    setCurrentEntityIds([]);
    setCurrentQuestionType("main");
    setInputValue("");
  }, []);

  return (
    <div className="h-full flex">
      {/* Chat Panel - 40% */}
      <div className="w-2/5 flex flex-col border-r border-border-subtle">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="text-text-tertiary mb-2">
                Ask questions about your knowledge base
              </div>
              <p className="text-sm text-text-tertiary max-w-md">
                I can help you find connections between articles, summarize
                topics, and explore your ingested content.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <AskMessage key={message.id} message={message} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border-subtle p-4">
          {messages.length > 0 && (
            <button
              onClick={handleNewQuestion}
              className="mb-3 text-sm text-text-tertiary hover:text-text-secondary"
            >
              + New Question
            </button>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a question..."
              disabled={isLoading}
              className="flex-1 bg-bg-secondary border border-border-subtle rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-4 py-2 bg-text-primary text-bg-primary rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-text-secondary transition-colors"
            >
              {isLoading ? "..." : "Ask"}
            </button>
          </form>
        </div>
      </div>

      {/* Graph Panel - 60% */}
      <div className="w-3/5 bg-bg-primary">
        <AskGraph
          entityIds={currentEntityIds}
          onNodeClick={handleNodeClick}
          questionType={currentQuestionType}
        />
      </div>
    </div>
  );
}
