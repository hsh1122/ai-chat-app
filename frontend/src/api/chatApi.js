export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

async function parseJsonResponse(response, fallbackMessage) {
  if (!response.ok) {
    let detail = fallbackMessage;
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // Keep fallback message when body is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function fetchSessions() {
  const response = await fetch(`${API_BASE_URL}/chat/sessions`);
  return parseJsonResponse(response, "Failed to load chat sessions");
}

export async function renameSession(sessionId, title) {
  const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  return parseJsonResponse(response, "Failed to rename chat session");
}

export async function deleteSession(sessionId) {
  const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    let detail = "Failed to delete chat session";
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // Keep fallback if response body isn't JSON.
    }
    throw new Error(detail);
  }
}

export async function fetchSessionMessages(sessionId) {
  const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`);
  return parseJsonResponse(response, "Failed to load chat messages");
}

function parseSseBlock(block) {
  const lines = block.split("\n");
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

export async function streamChat({
  messages,
  sessionId,
  model,
  regenerate = false,
  onSession,
  onToken,
  onDone,
  onError,
  signal,
}) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      session_id: sessionId,
      model,
      regenerate,
    }),
    signal,
  });

  if (!response.ok) {
    let detail = "Failed to send chat message";
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // Keep fallback if response body isn't JSON.
    }
    throw new Error(detail);
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this browser");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const payload = parseSseBlock(block);
      if (!payload) {
        continue;
      }

      if (payload.event === "session") {
        onSession?.(payload.data?.session_id);
      } else if (payload.event === "token") {
        onToken?.(payload.data?.content || "");
      } else if (payload.event === "done") {
        onDone?.();
        return;
      } else if (payload.event === "error") {
        const message = payload.data?.error || "Streaming failed";
        onError?.(message);
        throw new Error(message);
      }
    }
  }

  onDone?.();
}
