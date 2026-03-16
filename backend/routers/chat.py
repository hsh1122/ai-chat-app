from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import ChatMessage, ChatSession


router = APIRouter(prefix="", tags=["chat"])

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BACKEND_DIR, ".env")
load_dotenv(ENV_PATH, override=True)


def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        base_url=os.getenv("OPENAI_BASE_URL"),
        api_key=os.getenv("OPENAI_API_KEY"),
    )


DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

print(f"[chat] using base_url={BASE_URL} model={DEFAULT_MODEL}")


class MessageInput(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[MessageInput] = Field(min_length=1)
    session_id: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=0.7, ge=0, le=2)
    max_tokens: int | None = Field(default=None, gt=0)
    regenerate: bool = False


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    model: str | None
    created_at: datetime


class SessionRenameRequest(BaseModel):
    title: str = Field(min_length=1)


def _sse(data: dict, event: str | None = None) -> str:
    lines: list[str] = []
    if event:
        lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data, ensure_ascii=False)}")
    return "\n".join(lines) + "\n\n"


def _get_or_create_session(db: Session, session_id: str | None) -> ChatSession:
    if session_id:
        session = db.get(ChatSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    session = ChatSession()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _extract_last_user_message(messages: list[MessageInput]) -> str | None:
    for message in reversed(messages):
        if message.role == "user":
            return message.content
    return None


@router.post("/chat")
async def chat(request: ChatRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    session = _get_or_create_session(db, request.session_id)

    last_user_message = _extract_last_user_message(request.messages)
    if not last_user_message:
        raise HTTPException(status_code=400, detail="At least one user message is required")

    last_assistant_message: ChatMessage | None = None
    if request.regenerate:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id, ChatMessage.role == "assistant")
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(1)
        )
        last_assistant_message = db.scalar(stmt)
        if not last_assistant_message:
            raise HTTPException(status_code=400, detail="No assistant message to regenerate")
    else:
        db.add(
            ChatMessage(
                session_id=session.id,
                role="user",
                content=last_user_message,
                model=request.model or DEFAULT_MODEL,
            )
        )
        session.updated_at = datetime.utcnow()
        db.commit()

    payload = {
        "model": request.model or DEFAULT_MODEL,
        "messages": [m.model_dump() for m in request.messages],
        "stream": True,
    }
    if request.temperature is not None:
        payload["temperature"] = request.temperature
    if request.max_tokens is not None:
        payload["max_tokens"] = request.max_tokens

    async def event_stream():
        assistant_parts: list[str] = []

        yield _sse({"session_id": session.id}, event="session")

        try:
            client = get_client()
            stream = await client.chat.completions.create(**payload)
            async for chunk in stream:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta.content or ""
                if not delta:
                    continue

                assistant_parts.append(delta)
                yield _sse({"content": delta}, event="token")

            assistant_message = "".join(assistant_parts).strip()
            if assistant_message:
                if request.regenerate and last_assistant_message is not None:
                    db.delete(last_assistant_message)
                db.add(
                    ChatMessage(
                        session_id=session.id,
                        role="assistant",
                        content=assistant_message,
                        model=request.model or DEFAULT_MODEL,
                    )
                )
                if not request.regenerate and not session.title:
                    session.title = (last_user_message[:60] + "...") if len(last_user_message) > 60 else last_user_message
                session.updated_at = datetime.utcnow()
                db.commit()

            yield _sse({"done": True}, event="done")

        except Exception as exc:
            db.rollback()
            yield _sse({"error": str(exc)}, event="error")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/chat/sessions", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)) -> list[ChatSession]:
    stmt = select(ChatSession).order_by(ChatSession.updated_at.desc())
    return list(db.scalars(stmt).all())


@router.delete("/chat/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)) -> dict[str, str]:
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()
    return {"id": session_id}


@router.patch("/chat/sessions/{session_id}", response_model=SessionOut)
def rename_session(session_id: str, request: SessionRenameRequest, db: Session = Depends(get_db)) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    session.title = title
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.get("/chat/sessions/{session_id}/messages", response_model=list[MessageOut])
def list_messages(session_id: str, db: Session = Depends(get_db)) -> list[ChatMessage]:
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    )
    return list(db.scalars(stmt).all())
