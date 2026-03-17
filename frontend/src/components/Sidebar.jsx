import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function formatSessionDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  deletingSessionId,
  onNewChat,
  isLoading,
}) {
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [openMenuSessionId, setOpenMenuSessionId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    placement: "bottom",
    ready: false,
  });
  const menuRef = useRef(null);
  const menuButtonRefs = useRef({});

  useEffect(() => {
    if (!openMenuSessionId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const menuElement = menuRef.current;
      const buttonElement = menuButtonRefs.current[openMenuSessionId];
      const target = event.target;

      if (menuElement?.contains(target) || buttonElement?.contains(target)) {
        return;
      }

      setOpenMenuSessionId(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openMenuSessionId]);

  useLayoutEffect(() => {
    if (!openMenuSessionId) {
      setMenuPosition({
        top: 0,
        left: 0,
        placement: "bottom",
        ready: false,
      });
      return undefined;
    }

    const updateMenuPosition = () => {
      const buttonElement = menuButtonRefs.current[openMenuSessionId];
      const menuElement = menuRef.current;

      if (!buttonElement || !menuElement) {
        return;
      }

      const buttonRect = buttonElement.getBoundingClientRect();
      const menuRect = menuElement.getBoundingClientRect();
      const gap = 8;
      const viewportPadding = 12;
      const spaceBelow = window.innerHeight - buttonRect.bottom - viewportPadding;
      const spaceAbove = buttonRect.top - viewportPadding;
      const shouldOpenUpward =
        spaceBelow < menuRect.height + gap && spaceAbove > spaceBelow;

      const top = shouldOpenUpward
        ? Math.max(viewportPadding, buttonRect.top - menuRect.height - gap)
        : Math.min(
            window.innerHeight - viewportPadding - menuRect.height,
            buttonRect.bottom + gap,
          );

      const left = Math.min(
        window.innerWidth - viewportPadding - menuRect.width,
        Math.max(viewportPadding, buttonRect.right - menuRect.width),
      );

      setMenuPosition({
        top,
        left,
        placement: shouldOpenUpward ? "top" : "bottom",
        ready: true,
      });
    };

    updateMenuPosition();

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [openMenuSessionId]);

  const startRename = (session) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title || "");
    setOpenMenuSessionId(null);
  };

  const cancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const saveRename = async (session) => {
    if (!editingSessionId || editingSessionId !== session.id || !onRenameSession) {
      return;
    }

    const nextTitle = editingTitle.trim();
    if (!nextTitle || nextTitle === (session.title || "").trim()) {
      cancelRename();
      return;
    }

    setRenamingSessionId(session.id);
    try {
      await onRenameSession(session.id, nextTitle);
      cancelRename();
    } catch {
      // Error banner is handled in App.
    } finally {
      setRenamingSessionId(null);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <p className="sidebar-kicker">Workspace</p>
        <h1>AI Chat</h1>
        <button type="button" className="new-chat-btn" onClick={onNewChat}>
          New Chat
        </button>
      </div>

      <div className="sidebar-section-title">
        <span>Recent Chats</span>
        <span className="session-count">{sessions.length}</span>
      </div>

      <div className="sidebar-list" role="list">
        {isLoading && <p className="sidebar-hint">Loading chats...</p>}
        {!isLoading && !sessions.length && <p className="sidebar-hint">No chat history yet</p>}

        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isDeleting = deletingSessionId === session.id;
          const isEditing = editingSessionId === session.id;
          const isRenaming = renamingSessionId === session.id;

          return (
            <div key={session.id} className={`session-row ${isActive ? "active" : ""}`} data-session-row={session.id}>
              {isEditing ? (
                <div className={`session-item ${isActive ? "active" : ""}`}>
                  <input
                    className="session-rename-input"
                    value={editingTitle}
                    autoFocus
                    disabled={isRenaming}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveRename(session);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                  <span className="session-time">{formatSessionDate(session.updated_at)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className={`session-item ${isActive ? "active" : ""}`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className="session-title" title={session.title || "New chat"}>
                    {session.title || "New chat"}
                  </span>
                  <span className="session-time">{formatSessionDate(session.updated_at)}</span>
                </button>
              )}

              <div className="session-menu-wrap" data-menu-session-id={session.id}>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="session-menu-inline-btn"
                      disabled={isRenaming}
                      onClick={() => saveRename(session)}
                    >
                      {isRenaming ? "..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="session-menu-inline-btn"
                      disabled={isRenaming}
                      onClick={cancelRename}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="session-more-btn"
                    aria-label="More actions"
                    title="More actions"
                    disabled={isDeleting}
                    ref={(node) => {
                      if (node) {
                        menuButtonRefs.current[session.id] = node;
                      } else {
                        delete menuButtonRefs.current[session.id];
                      }
                    }}
                    onClick={() =>
                      setOpenMenuSessionId((prev) =>
                        prev === session.id ? null : session.id,
                      )
                    }
                  >
                    ...
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openMenuSessionId &&
        createPortal(
          <div
            ref={menuRef}
            className={`session-menu session-menu-portal session-menu-${menuPosition.placement}`}
            role="menu"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              visibility: menuPosition.ready ? "visible" : "hidden",
            }}
          >
            <button
              type="button"
              className="session-menu-item"
              onClick={() => {
                const session = sessions.find((item) => item.id === openMenuSessionId);
                if (session) {
                  startRename(session);
                }
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="session-menu-item danger"
              disabled={deletingSessionId === openMenuSessionId}
              onClick={() => {
                const sessionId = openMenuSessionId;
                setOpenMenuSessionId(null);
                onDeleteSession(sessionId);
              }}
            >
              {deletingSessionId === openMenuSessionId ? "Deleting..." : "Delete"}
            </button>
          </div>,
          document.body,
        )}
    </aside>
  );
}
