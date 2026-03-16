import { useEffect, useRef, useState } from "react";

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
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!openMenuSessionId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const root = sidebarRef.current;
      if (!root) {
        return;
      }

      const menuWrap = root.querySelector(`[data-menu-session-id="${openMenuSessionId}"]`);
      if (menuWrap && !menuWrap.contains(event.target)) {
        setOpenMenuSessionId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
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
    <aside className="sidebar" ref={sidebarRef}>
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
          const isMenuOpen = openMenuSessionId === session.id;

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
                  <>
                    <button
                      type="button"
                      className="session-more-btn"
                      aria-label="More actions"
                      title="More actions"
                      disabled={isDeleting}
                      onClick={() => setOpenMenuSessionId((prev) => (prev === session.id ? null : session.id))}
                    >
                      ...
                    </button>

                    {isMenuOpen && (
                      <div className="session-menu" role="menu">
                        <button
                          type="button"
                          className="session-menu-item"
                          onClick={() => startRename(session)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="session-menu-item danger"
                          disabled={isDeleting}
                          onClick={() => {
                            setOpenMenuSessionId(null);
                            onDeleteSession(session.id);
                          }}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
