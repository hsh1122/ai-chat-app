# Local Smoke Test Checklist

This checklist is intentionally lightweight and focuses on critical chat flows.

## 1. Start Services

Backend (PowerShell):

```powershell
cd d:\aiProject\ai-chat-app\backend
..\.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

Frontend (new PowerShell window):

```powershell
cd d:\aiProject\ai-chat-app\frontend
npm run dev
```

Open `http://localhost:5173`.

## 2. Session Restore (Main Goal)

- [ ] Open an existing session `A` from the sidebar.
- [ ] Refresh the browser page.
- [ ] Verify session `A` is still active (not switched to another recent session).

Fallback checks:

- [ ] Delete the currently active session.
- [ ] Verify app automatically switches to the newest available session.
- [ ] If no sessions remain, verify app enters empty new-chat state.

## 3. New Chat + Restore Behavior

- [ ] Click `New Chat`.
- [ ] Verify active session clears and chat window is empty.
- [ ] Refresh the browser page.
- [ ] Verify it stays in empty new-chat state when no active session is stored.

- [ ] In empty state, send one message to create a new session.
- [ ] Refresh the browser page.
- [ ] Verify it restores to this newly created session.

## 4. Delete Session Behavior

- [ ] Delete a non-active session from sidebar.
- [ ] Verify list refreshes immediately and current chat view is unchanged.

- [ ] Delete the active session.
- [ ] Verify list refreshes immediately.
- [ ] Verify auto-switch rule works:
- [ ] If sessions exist: switch to latest available session.
- [ ] If none exist: empty new-chat state.

## 5. Regression (Must Still Work)

- [ ] Manual session switch still loads correct history.
- [ ] Sending messages still streams token-by-token.
- [ ] Assistant reply is persisted after stream completion.
- [ ] Session title auto-generation still works for untitled session.
- [ ] Refresh after several interactions still restores the last opened session.

## 6. Optional Quick API Spot Check

In browser DevTools Network tab:

- [ ] `GET /chat/sessions` returns `200`.
- [ ] `GET /chat/sessions/{id}/messages` returns `200`.
- [ ] `POST /chat` returns stream events.
- [ ] `DELETE /chat/sessions/{id}` returns `200`.

## Notes

- If restore behavior seems wrong, hard refresh once (`Ctrl+F5`) and retry.
- If backend env changes were made, restart backend process fully.
