"""
FastAPI Application Entry Point — PradnyaChakshu
"""
import asyncio
import logging
import os
import sys

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(__file__))

from config import settings
from database import engine, Base
from routers import auth, audits
from ws_manager import ws_manager
from cleanup import run_cleanup_loop

logging.basicConfig(level=logging.INFO)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PradnyaChakshu API",
    description="AI Bias Detection & Fairness Auditing Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(audits.router, prefix="/api/v1")


# ── WebSocket endpoint ─────────────────────────────────────────────────────────
@app.websocket("/ws/audits/{audit_id}")
async def audit_websocket(websocket: WebSocket, audit_id: str):
    """
    Subscribe to real-time progress events for a specific audit.
    Emits WSEvent JSON frames: { audit_id, event, stage, pct, message, payload }
    """
    await ws_manager.connect(audit_id, websocket)
    try:
        # Keep alive — client just listens; server pushes events
        while True:
            # Receive any client ping/pong to detect disconnection
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(audit_id, websocket)
    except Exception:
        ws_manager.disconnect(audit_id, websocket)


# ── Startup: launch cleanup loop ───────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(run_cleanup_loop())


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "PradnyaChakshu API", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "PradnyaChakshu API. Visit /api/docs for Swagger UI."}
