"use client";

import ArticleAccordion from "./ArticleAccordion";

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

interface AskMessageProps {
  message: Message;
}

export default function AskMessage({ message }: AskMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-text-primary text-bg-primary rounded-2xl rounded-br-md px-4 py-2"
            : "space-y-3"
        }`}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <>
            {/* Loading state */}
            {message.isLoading ? (
              <div className="flex items-center gap-2 text-text-tertiary">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" />
                  <span
                    className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
                <span className="text-sm">Thinking...</span>
              </div>
            ) : (
              <>
                {/* Answer summary */}
                <div className="bg-bg-secondary rounded-lg p-4">
                  <p className="text-sm text-text-primary leading-relaxed">
                    {message.content}
                  </p>
                </div>

                {/* Article sources */}
                {message.articles && message.articles.length > 0 && (
                  <ArticleAccordion articles={message.articles} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
