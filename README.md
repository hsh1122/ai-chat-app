# AI Chat App

A small full-stack chat app with a React frontend and a FastAPI backend. It supports multiple chat sessions, stores chat history in SQLite, and streams assistant responses from an OpenAI-compatible API.

## Features

- Multiple chat sessions with a sidebar for switching between conversations
- Rename and delete existing sessions
- Automatic session titles based on the first user message
- Restore the last opened session after refresh
- Streaming assistant responses, with support for stopping generation
- Regenerate the last assistant reply in the current session
- Message timestamps in the chat UI
- Markdown rendering for assistant messages
- Basic code highlighting for fenced code blocks
- Copy assistant messages to the clipboard

## Tech Stack

- Frontend: React 18, Vite
- Backend: FastAPI
- Database: SQLite with SQLAlchemy
- AI client: OpenAI Python SDK
- Markdown: `react-markdown` + `remark-gfm`

## Project Structure

```text
.
├─ backend/
│  ├─ main.py
│  ├─ database.py
│  ├─ models.py
│  ├─ requirements.txt
│  ├─ .env
│  └─ routers/
│     └─ chat.py
├─ frontend/
│  ├─ package.json
│  ├─ vite.config.js
│  └─ src/
│     ├─ App.jsx
│     ├─ api/
│     │  └─ chatApi.js
│     ├─ components/
│     │  ├─ ChatWindow.jsx
│     │  ├─ Sidebar.jsx
│     │  └─ MessageBubble.jsx
│     └─ styles/
│        └─ global.css
└─ LOCAL_SMOKE_TEST.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- Python 3.x

### 1. Start the backend

Create and activate a virtual environment if needed, then install dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env` and set the required values:

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
ALLOWED_ORIGINS=http://localhost:5173
DATABASE_URL=sqlite:///./chat.db
```

Run the API server:

```bash
uvicorn main:app --reload --port 8000
```

### 2. Start the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on:

```text
http://localhost:5173
```

By default, the frontend sends requests to `http://localhost:8000`.

## Environment Variables

### Backend

- `OPENAI_API_KEY`: API key used by the backend
- `OPENAI_BASE_URL`: Base URL for the OpenAI-compatible API
- `OPENAI_MODEL`: Default model name used for chat requests
- `ALLOWED_ORIGINS`: Comma-separated CORS allowlist
- `DATABASE_URL`: Database connection string

### Frontend

- `VITE_API_BASE_URL`: Backend API base URL

Example:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Notes:

- `DATABASE_URL` falls back to local SQLite if not set.
- `VITE_API_BASE_URL` falls back to `http://localhost:8000` if not set.
- `OPENAI_BASE_URL` defaults to the standard OpenAI API URL if not set.
- If you are using a different provider or local model gateway, please verify the required base URL and model name.

## API Overview

Main endpoints:

- `GET /health` - health check
- `POST /chat` - send messages and receive a streamed assistant response
- `GET /chat/sessions` - list chat sessions
- `PATCH /chat/sessions/{session_id}` - rename a session
- `DELETE /chat/sessions/{session_id}` - delete a session
- `GET /chat/sessions/{session_id}/messages` - get messages for one session

## Screenshots

No screenshots are included in the repository right now.

You can add a few UI screenshots here later if needed.

## Future Improvements

- Add test coverage for core frontend and backend chat flows
- Replace the custom code highlighter with a more complete highlighting library
- Add `.env.example` files for easier local setup
- Improve error handling and retry behavior in the chat UI

## Notes / Limitations

- Session titles are generated from the first user message and can be renamed later.
- Chat history is stored in SQLite by default.
- Assistant responses are rendered as Markdown, but only assistant messages use Markdown rendering in the current UI.
- Code highlighting is implemented manually and currently covers a few common languages in a basic way.
- There is no deployment guide in the repository right now.
- Authentication and multi-user access are not present in the current codebase.
