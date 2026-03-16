import { useEffect, useMemo, useRef } from "react";

import MessageBubble from "./MessageBubble";

export default function ChatWindow({ messages, onRegenerate, canRegenerate }) {
  const bottomRef = useRef(null);

  const isStreaming = useMemo(() => messages.some((message) => message.isStreaming), [messages]);
  const lastAssistantIndex = useMemo(
    () => messages.map((message) => message.role).lastIndexOf("assistant"),
    [messages]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!messages.length) {
    return (
      <section className="chat-window empty">
        <div className="empty-state">
          <div className="empty-state-orb" aria-hidden="true" />
          <h2>Start a conversation</h2>
          <p>Ask a question, paste code, or describe a task to begin.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-window">
      {isStreaming && (
        <div className="stream-banner" role="status" aria-live="polite">
          <span className="stream-banner-dot" />
          Assistant is generating a response
        </div>
      )}

      <div className="message-stack">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            showRegenerate={index === lastAssistantIndex && canRegenerate && !message.isStreaming}
            onRegenerate={onRegenerate}
          />
        ))}
      </div>

      <div ref={bottomRef} />
    </section>
  );
}
