"""
WebSocket Connection Manager — PradnyaChakshu
Manages per-audit WebSocket channels and broadcasts progress events.
"""
import json
from typing import Dict, List
from fastapi import WebSocket


class AuditWebSocketManager:
    """
    Manages active WebSocket connections keyed by audit_id.
    Multiple clients can subscribe to the same audit_id.
    """

    def __init__(self):
        # audit_id → list of connected WebSocket clients
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, audit_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active.setdefault(audit_id, []).append(websocket)

    def disconnect(self, audit_id: str, websocket: WebSocket):
        if audit_id in self.active:
            self.active[audit_id] = [
                ws for ws in self.active[audit_id] if ws is not websocket
            ]
            if not self.active[audit_id]:
                del self.active[audit_id]

    async def emit(
        self,
        audit_id: str,
        event: str,           # 'progress' | 'done' | 'error'
        stage: str,           # 'detect' | 'metrics' | 'shap' | 'llm' | 'pdf'
        pct: int,             # 0-100
        message: str,
        payload: dict = None,
    ):
        """Broadcast a WSEvent to all subscribers for this audit_id."""
        data = json.dumps({
            "audit_id": audit_id,
            "event": event,
            "stage": stage,
            "pct": pct,
            "message": message,
            "payload": payload or {},
        })
        dead = []
        for ws in self.active.get(audit_id, []):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(audit_id, ws)


# Global singleton — imported wherever progress events need to be emitted
ws_manager = AuditWebSocketManager()
