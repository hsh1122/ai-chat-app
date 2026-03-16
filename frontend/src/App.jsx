import { useEffect, useRef, useState } from "react";

import { deleteSession, fetchSessionMessages, fetchSessions, renameSession, streamChat } from "./api/chatApi";
import ChatWindow from "./components/ChatWindow";
import Sidebar from "./components/Sidebar";

const ACTIVE_SESSION_STORAGE_KEY = "ai-chat:last-active-session-id";

function getStoredActiveSessionId() {
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeActiveSessionId(sessionId) {
  try {
    if (!sessionId) {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore localStorage failures to keep chat usable.
  }
}

function normalizeMessages(items) {
  return items.map((item, index) => ({
    id: item.id ?? `msg-${index}`,
    role: item.role,
    content: item.content,
    created_at: item.created_at ?? null,
  }));
}

function getLastAssistantIndex(items) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].role === "assistant") {
      return i;
    }
  }
  return -1;
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [error, setError] = useState("");

  const streamAbortRef = useRef(null);

  const clearStreamingState = () => {
    setMessages((prev) =>
      prev.map((message) => (message.isStreaming ? { ...message, isStreaming: false } : message))
    );
  };

  const loadSessions = async () => {
    const data = await fetchSessions();
    setSessions(data);
    return data;
  };

  const loadMessages = async (sessionId) => {
    const data = await fetchSessionMessages(sessionId);
    setMessages(normalizeMessages(data));
  };

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const data = await loadSessions();
        if (!mounted) {
          return;
        }

        if (!data.length) {
          setActiveSessionId(null);
          setMessages([]);
          storeActiveSessionId(null);
          return;
        }

        const storedSessionId = getStoredActiveSessionId();
        const hasStoredSession = storedSessionId && data.some((session) => session.id === storedSessionId);
        const nextSessionId = hasStoredSession ? storedSessionId : data[0].id;

        setActiveSessionId(nextSessionId);
        storeActiveSessionId(nextSessionId);
        await loadMessages(nextSessionId);
      } catch (err) {
        if (mounted) {
          setError(err.message || "Failed to load chat sessions");
        }
      } finally {
        if (mounted) {
          setIsSidebarLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
      streamAbortRef.current?.abort();
    };
  }, []);

  const handleSelectSession = async (sessionId) => {
    if (sessionId === activeSessionId) {
      return;
    }

    streamAbortRef.current?.abort();
    setIsSending(false);
    setError("");
    setActiveSessionId(sessionId);
    storeActiveSessionId(sessionId);

    try {
      await loadMessages(sessionId);
    } catch (err) {
      setError(err.message || "Failed to load chat history");
    }
  };

  const handleRenameSession = async (sessionId, title) => {
    try {
      await renameSession(sessionId, title);
      await loadSessions();
    } catch (err) {
      setError(err.message || "Failed to rename chat session");
      throw err;
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!sessionId || deletingSessionId) {
      return;
    }

    streamAbortRef.current?.abort();
    setIsSending(false);
    setError("");
    setDeletingSessionId(sessionId);

    try {
      await deleteSession(sessionId);
      const updatedSessions = await loadSessions();

      if (sessionId === activeSessionId) {
        if (!updatedSessions.length) {
          setActiveSessionId(null);
          setMessages([]);
          setInput("");
          storeActiveSessionId(null);
          return;
        }

        const nextSessionId = updatedSessions[0].id;
        setActiveSessionId(nextSessionId);
        storeActiveSessionId(nextSessionId);
        await loadMessages(nextSessionId);
      }
    } catch (err) {
      setError(err.message || "Failed to delete chat session");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleNewChat = () => {
    streamAbortRef.current?.abort();
    setIsSending(false);
    setError("");
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    storeActiveSessionId(null);
  };

  const handleStopGenerating = () => {
    if (!isSending) {
      return;
    }

    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    clearStreamingState();
    setIsSending(false);
  };

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    const userMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantMessageId = `local-assistant-${Date.now()}`;
    const assistantPlaceholder = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      isStreaming: true,
    };

    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantPlaceholder]);
    setInput("");
    setIsSending(true);
    setError("");

    const controller = new AbortController();
    streamAbortRef.current = controller;

    let resolvedSessionId = activeSessionId;

    try {
      await streamChat({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        sessionId: activeSessionId,
        onSession: (sessionId) => {
          if (!resolvedSessionId && sessionId) {
            resolvedSessionId = sessionId;
            setActiveSessionId(sessionId);
            storeActiveSessionId(sessionId);
          }
        },
        onToken: (token) => {
          if (!token) {
            return;
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${token}` }
                : message
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId ? { ...message, isStreaming: false } : message
            )
          );
        },
        onError: (message) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: item.content || `Error: ${message}`,
                    isStreaming: false,
                  }
                : item
            )
          );
        },
        signal: controller.signal,
      });

      await loadSessions();
      if (resolvedSessionId) {
        await loadMessages(resolvedSessionId);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        clearStreamingState();
      } else {
        setError(err.message || "Failed to stream response");
      }
    } finally {
      setIsSending(false);
      streamAbortRef.current = null;
    }
  };

  const handleRegenerateLastAssistant = async () => {
    if (isSending || !activeSessionId) {
      return;
    }

    const lastAssistantIndex = getLastAssistantIndex(messages);
    if (lastAssistantIndex < 0) {
      return;
    }

    const contextMessages = messages
      .slice(0, lastAssistantIndex)
      .map(({ role, content }) => ({ role, content }));

    if (!contextMessages.some((message) => message.role === "user")) {
      setError("No user context available for regeneration");
      return;
    }

    const assistantMessageId = `local-regenerate-${Date.now()}`;
    const assistantPlaceholder = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev.slice(0, lastAssistantIndex), assistantPlaceholder]);
    setIsSending(true);
    setError("");

    const controller = new AbortController();
    streamAbortRef.current = controller;
    let resolvedSessionId = activeSessionId;

    try {
      await streamChat({
        messages: contextMessages,
        sessionId: activeSessionId,
        regenerate: true,
        onSession: (sessionId) => {
          if (sessionId) {
            resolvedSessionId = sessionId;
          }
        },
        onToken: (token) => {
          if (!token) {
            return;
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${token}` }
                : message
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId ? { ...message, isStreaming: false } : message
            )
          );
        },
        onError: (message) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: item.content || `Error: ${message}`,
                    isStreaming: false,
                  }
                : item
            )
          );
        },
        signal: controller.signal,
      });

      await loadSessions();
      if (resolvedSessionId) {
        await loadMessages(resolvedSessionId);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        clearStreamingState();
      } else {
        setError(err.message || "Failed to regenerate response");
      }
    } finally {
      setIsSending(false);
      streamAbortRef.current = null;
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        deletingSessionId={deletingSessionId}
        onNewChat={handleNewChat}
        isLoading={isSidebarLoading}
      />

      <main className="chat-layout">
        <ChatWindow
          messages={messages}
          onRegenerate={handleRegenerateLastAssistant}
          canRegenerate={!isSending && !!activeSessionId}
        />

        <div className="composer-wrap">
          {error && <p className="error-banner">{error}</p>}
          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Send a message..."
              rows={1}
              disabled={isSending}
            />
            <button
              type="button"
              onClick={isSending ? handleStopGenerating : handleSendMessage}
              disabled={!isSending && !input.trim()}
            >
              {isSending ? "Stop" : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
