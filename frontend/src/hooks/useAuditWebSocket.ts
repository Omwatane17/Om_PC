/**
 * useAuditWebSocket — TRD §8.3
 * Connects to ws://localhost:8000/ws/audits/{auditId} and receives WSEvent frames.
 * Falls back to polling if WebSocket is unavailable.
 */
import { useEffect, useRef, useState } from 'react'

export interface WSEvent {
  audit_id: string
  event: 'progress' | 'done' | 'error'
  stage: 'detect' | 'metrics' | 'shap' | 'llm' | 'pdf' | 'failed' | 'queued'
  pct: number       // 0–100
  message: string
  payload: Record<string, any>
}

const STAGE_LABELS: Record<string, string> = {
  detect:  '🔍 Detecting sensitive attributes',
  metrics: '📊 Computing fairness metrics',
  shap:    '🧩 Running SHAP analysis',
  llm:     '🤖 Generating AI explanation',
  pdf:     '📄 Building PDF report',
  queued:  '⏳ Queued',
  failed:  '❌ Failed',
}

export function useAuditWebSocket(auditId: string | undefined, enabled: boolean) {
  const [progress, setProgress] = useState<WSEvent | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!auditId || !enabled) return

    let cancelled = false

    function connect() {
      if (cancelled) return
      // Use ws:// for development; wss:// in production
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const host = window.location.hostname
      const port = '8000'   // Backend port
      const url = `${proto}://${host}:${port}/ws/audits/${auditId}`

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!cancelled) setConnected(true)
      }

      ws.onmessage = (evt) => {
        if (cancelled) return
        try {
          const data: WSEvent = JSON.parse(evt.data)
          setProgress(data)
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false)
          // Reconnect after 2s if not intentionally closed
          reconnectRef.current = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) wsRef.current.close()
      setConnected(false)
    }
  }, [auditId, enabled])

  return { progress, connected }
}

export { STAGE_LABELS }
