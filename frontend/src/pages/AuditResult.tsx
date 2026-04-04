import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'
import {
  ArrowLeft, Download, ShieldCheck, AlertTriangle, CheckCircle,
  XCircle, Info, ChevronDown, ChevronUp, X, FileDown, Wifi, WifiOff,
} from 'lucide-react'
import api from '../api/client'
import { useAuditWebSocket, STAGE_LABELS } from '../hooks/useAuditWebSocket'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditData {
  audit_id: string; status: string; created_at: string
  dataset_summary: any; fairness_metrics: Record<string, any>
  shap_summary: any; counterfactuals: any[]; llm_explanation: any
  risk_score: number; risk_level: string; report_url: string | null
  protected_attrs: string[]; regulation: string; model_type: string; org_context: string
}

// ─── RiskGauge ────────────────────────────────────────────────────────────────
function RiskGauge({ score, level }: { score: number; level: string }) {
  const color = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }[level] || '#94a3b8'
  const angle = (score / 100) * 180 - 90; const r = 80
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={200} height={120} viewBox="0 0 200 120">
        {[{ color: '#10b981', s: -90, e: -54 }, { color: '#f59e0b', s: -54, e: 0 },
          { color: '#f97316', s: 0, e: 36 }, { color: '#ef4444', s: 36, e: 90 }].map((seg, i) => {
          const rad = (d: number) => d * Math.PI / 180
          return <path key={i} d={`M 100 100 L ${100 + r * Math.cos(rad(seg.s))} ${100 + r * Math.sin(rad(seg.s))} A ${r} ${r} 0 0 1 ${100 + r * Math.cos(rad(seg.e))} ${100 + r * Math.sin(rad(seg.e))} Z`} fill={seg.color} opacity={0.3} />
        })}
        <line x1={100} y1={100} x2={100 + 65 * Math.cos(angle * Math.PI / 180)} y2={100 + 65 * Math.sin(angle * Math.PI / 180)} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={100} cy={100} r={6} fill={color} />
        <text x={100} y={85} textAnchor="middle" fill={color} fontSize={20} fontWeight="bold">{score}</text>
        <text x={100} y={100} textAnchor="middle" fill="white" fontSize={11} fontWeight="700">{level}</text>
      </svg>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -10 }}>RISK SCORE / 100</div>
    </div>
  )
}

// ─── MetricRow ────────────────────────────────────────────────────────────────
function MetricRow({ metric }: { metric: any }) {
  const [expanded, setExpanded] = useState(false)
  const pf = metric.pass_fail; const isDir = metric.metric_name?.includes('Disparate Impact')
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{metric.metric_name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>({metric.protected_attr})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700 }}>{metric.overall_value?.toFixed(4)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>thresh: {isDir ? `≥${metric.threshold}` : `≤${metric.threshold}`}</span>
          <span className={`badge ${pf === 'PASS' ? 'badge-pass' : 'badge-fail'}`}>
            {pf === 'PASS' ? <CheckCircle size={10} /> : <XCircle size={10} />}{pf}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {expanded && metric.by_group && (
        <div style={{ marginTop: 16, paddingLeft: 16 }}>
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Object.entries(metric.by_group).map(([k, v]) => ({ group: k, value: +(v as number).toFixed(4) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="group" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {Object.keys(metric.by_group).map((_, i) => <Cell key={i} fill={['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'][i % 5]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── NEW: BiasHeatmap ─────────────────────────────────────────────────────────
function BiasHeatmap({ metrics }: { metrics: Record<string, any> }) {
  const metricList = Object.values(metrics)
  const attrs = [...new Set(metricList.map((m: any) => m.protected_attr))] as string[]
  const metricNames = [...new Set(metricList.map((m: any) => m.metric_name))] as string[]
  if (attrs.length === 0 || metricNames.length === 0) return null

  const cellW = Math.max(90, Math.floor(680 / metricNames.length))
  const cellH = 44; const labelW = 110; const headerH = 48
  const svgW = labelW + cellW * metricNames.length
  const svgH = headerH + cellH * attrs.length + 16

  const getCell = (attr: string, mName: string) =>
    metricList.find((m: any) => m.protected_attr === attr && m.metric_name === mName)

  const passColor = '#10b981'; const failColor = '#ef4444'; const warnColor = '#f59e0b'
  const cellColor = (pf: string) =>
    pf === 'PASS' ? 'rgba(16,185,129,0.18)' : pf === 'FAIL' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.12)'
  const textColor = (pf: string) => pf === 'PASS' ? passColor : pf === 'FAIL' ? failColor : warnColor

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: svgW }}>
        {/* Column headers */}
        {metricNames.map((mn, ci) => (
          <g key={ci}>
            <rect x={labelW + ci * cellW} y={0} width={cellW - 2} height={headerH - 4} rx={6}
              fill="rgba(99,102,241,0.12)" />
            <text x={labelW + ci * cellW + cellW / 2} y={headerH / 2 - 4}
              textAnchor="middle" fill="#a5b4fc" fontSize={8.5} fontWeight="600">
              {mn.replace(' Difference', '').replace(' Ratio', '').replace(' Score', '')}
            </text>
          </g>
        ))}
        {/* Row labels + cells */}
        {attrs.map((attr, ri) => (
          <g key={ri}>
            <rect x={0} y={headerH + ri * cellH} width={labelW - 4} height={cellH - 2} rx={6}
              fill="rgba(255,255,255,0.04)" />
            <text x={labelW / 2} y={headerH + ri * cellH + cellH / 2 + 1}
              textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize={10} fontWeight="600">
              {attr}
            </text>
            {metricNames.map((mn, ci) => {
              const cell = getCell(attr, mn)
              if (!cell) return (
                <rect key={ci} x={labelW + ci * cellW} y={headerH + ri * cellH} width={cellW - 2} height={cellH - 2} rx={6} fill="rgba(255,255,255,0.02)" />
              )
              const pf = cell.pass_fail
              return (
                <g key={ci}>
                  <rect x={labelW + ci * cellW} y={headerH + ri * cellH} width={cellW - 2} height={cellH - 2} rx={6} fill={cellColor(pf)} />
                  <text x={labelW + ci * cellW + cellW / 2} y={headerH + ri * cellH + cellH / 2 - 5}
                    textAnchor="middle" dominantBaseline="middle" fill={textColor(pf)} fontSize={9} fontWeight="700">
                    {pf}
                  </text>
                  <text x={labelW + ci * cellW + cellW / 2} y={headerH + ri * cellH + cellH / 2 + 9}
                    textAnchor="middle" dominantBaseline="middle" fill={textColor(pf)} fontSize={8} opacity={0.8}>
                    {cell.overall_value?.toFixed(3)}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
        {[['#10b981', 'PASS'], ['#ef4444', 'FAIL'], ['#f59e0b', 'WARNING']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block', opacity: 0.7 }} />{l}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── NEW: ShapBeeswarm ────────────────────────────────────────────────────────
function ShapBeeswarm({ topFeatures, byGroup }: { topFeatures: any[]; byGroup: any }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<{ x: number; y: number; label: string } | null>(null)
  if (!topFeatures || topFeatures.length === 0) return null

  const W = 640; const H = 320; const padL = 130; const padR = 20; const padT = 30; const padB = 30
  const features = topFeatures.slice(0, 10)
  const groups: string[] = byGroup ? Object.keys(Object.values(byGroup)[0] as any || {}) : []
  const groupColors: Record<string, string> = {}
  const palette = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#ec4899']
  groups.forEach((g, i) => { groupColors[g] = palette[i % palette.length] })

  const maxVal = Math.max(...features.map((f: any) => Math.abs(f.importance)), 0.01)
  const xScale = (v: number) => padL + ((v + maxVal) / (2 * maxVal)) * (W - padL - padR)
  const rowH = (H - padT - padB) / features.length

  // Build scatter points: per feature, per group, jitter Y
  const points: { x: number; y: number; color: string; label: string }[] = []
  features.forEach((f: any, fi: number) => {
    const baseY = padT + fi * rowH + rowH / 2
    if (byGroup) {
      Object.entries(byGroup).forEach(([_attr, gMap]: [string, any]) => {
        Object.entries(gMap).forEach(([group, feats]: [string, any]) => {
          const feat = (feats as any[]).find((ff: any) => ff.feature === f.feature)
          if (feat) {
            points.push({
              x: xScale(feat.importance),
              y: baseY + (Math.random() - 0.5) * (rowH * 0.6),
              color: groupColors[group] || '#6366f1',
              label: `${group}: ${feat.importance?.toFixed(4)}`,
            })
          }
        })
      })
    } else {
      points.push({ x: xScale(f.importance), y: baseY, color: '#6366f1', label: `${f.feature}: ${f.importance?.toFixed(4)}` })
    }
  })

  const zeroX = xScale(0)

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg ref={svgRef} width={W} height={H} style={{ display: 'block' }}>
        {/* Zero line */}
        <line x1={zeroX} y1={padT} x2={zeroX} y2={H - padB} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />
        <text x={zeroX} y={padT - 6} textAnchor="middle" fill="#94a3b8" fontSize={9}>0</text>
        {/* Feature row labels + guide lines */}
        {features.map((f: any, fi: number) => {
          const y = padT + fi * rowH + rowH / 2
          return (
            <g key={fi}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.04)" />
              <text x={padL - 8} y={y + 1} textAnchor="end" dominantBaseline="middle"
                fill="#94a3b8" fontSize={9.5}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.feature.length > 14 ? f.feature.slice(0, 13) + '…' : f.feature}
              </text>
            </g>
          )
        })}
        {/* Scatter dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={5} fill={p.color} opacity={0.8}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHovered({ x: p.x, y: p.y, label: p.label })}
            onMouseLeave={() => setHovered(null)} />
        ))}
        {/* Axis labels */}
        <text x={padL} y={H - 6} fill="#94a3b8" fontSize={9}>← Negative impact</text>
        <text x={W - padR} y={H - 6} textAnchor="end" fill="#94a3b8" fontSize={9}>Positive impact →</text>
        {/* Hover tooltip */}
        {hovered && (
          <g>
            <rect x={hovered.x + 8} y={hovered.y - 16} width={hovered.label.length * 5.5 + 10} height={20} rx={4} fill="rgba(0,0,0,0.85)" />
            <text x={hovered.x + 13} y={hovered.y - 4} fill="white" fontSize={10}>{hovered.label}</text>
          </g>
        )}
      </svg>
      {/* Legend */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
          {groups.map(g => (
            <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: groupColors[g], display: 'inline-block' }} />{g}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── NEW: Counterfactual Drill-Down Modal ─────────────────────────────────────
function CFModal({ cf, onClose }: { cf: any; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
    }} onClick={onClose}>
      <div className="glass-card" style={{ maxWidth: 560, width: '100%', padding: 28, position: 'relative' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)'
        }}><X size={14} /></button>

        <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Row #{cf.row_index} — Drill-Down</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Full counterfactual explanation for this individual decision
        </p>

        {/* Decision summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Protected Attribute', value: cf.attribute, color: '#a5b4fc' },
            { label: 'Decision Changed?', value: cf.decision_changed ? '⚠ YES' : '✓ No', color: cf.decision_changed ? '#ef4444' : '#10b981' },
            { label: 'Original Value', value: cf.original_value, color: '#e2e8f0' },
            { label: 'Counterfactual Value', value: cf.counterfactual_value, color: '#06b6d4' },
            { label: 'Original Score', value: cf.original_score?.toFixed(4), color: '#e2e8f0' },
            { label: 'CF Score', value: cf.counterfactual_score?.toFixed(4), color: '#e2e8f0' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color, fontFamily: 'JetBrains Mono, monospace' }}>{value ?? '—'}</div>
            </div>
          ))}
        </div>

        {/* Score delta visual */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Score Delta</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${Math.min(Math.abs(cf.score_delta) * 300, 100)}%`,
                background: cf.score_delta > 0 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f87171)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: 14, color: cf.score_delta > 0 ? '#10b981' : '#ef4444', minWidth: 60 }}>
              {cf.score_delta > 0 ? '+' : ''}{cf.score_delta?.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Feature values from row data if available */}
        {cf.feature_values && Object.keys(cf.feature_values).length > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Feature Values for This Row</div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead><tr><th>Feature</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(cf.feature_values).map(([k, v]) => (
                    <tr key={k}><td style={{ color: 'var(--text-secondary)' }}>{k}</td><td style={{ fontFamily: 'monospace' }}>{String(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6 }}>
          💡 This person would have received a <strong style={{ color: '#06b6d4' }}>{cf.score_delta > 0 ? 'higher' : 'lower'}</strong> score
          if their <strong style={{ color: '#a5b4fc' }}>{cf.attribute}</strong> were <strong style={{ color: '#06b6d4' }}>{cf.counterfactual_value}</strong> instead of <strong>{cf.original_value}</strong>.
        </p>
      </div>
    </div>
  )
}

// ─── NEW: Export SHAP as CSV ──────────────────────────────────────────────────
function exportShapCSV(shap: any, auditId: string) {
  const rows: string[] = ['feature,importance,group,attribute']
  if (shap.top_features) {
    shap.top_features.forEach((f: any) => {
      rows.push(`"${f.feature}",${f.importance ?? ''},"ALL","overall"`)
    })
  }
  if (shap.by_group) {
    Object.entries(shap.by_group).forEach(([attr, groups]: [string, any]) => {
      Object.entries(groups).forEach(([group, features]: [string, any]) => {
        (features as any[]).forEach((f: any) => {
          rows.push(`"${f.feature}",${f.importance ?? ''},"${group}","${attr}"`)
        })
      })
    })
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `shap_values_${auditId.slice(0, 8)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AuditResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [audit, setAudit] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'shap' | 'ai' | 'counterfactuals'>('overview')
  const [selectedCF, setSelectedCF] = useState<any | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showBeeswarm, setShowBeeswarm] = useState(false)
  const pollRef = useRef<any>(null)

  // WebSocket real-time progress (TRD §8.3)
  const isLive = !!audit && ['pending', 'running'].includes(audit.status)
  const { progress: wsProgress, connected: wsConnected } = useAuditWebSocket(id, isLive)

  const fetchAudit = async () => {
    try {
      const { data } = await api.get(`/audits/${id}`)
      setAudit(data)
      if (data.status === 'complete' || data.status === 'failed') clearInterval(pollRef.current)
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { fetchAudit() }, [id])

  // When WS reports 'done', re-fetch full results immediately
  useEffect(() => {
    if (wsProgress?.event === 'done') fetchAudit()
  }, [wsProgress?.event])

  // HTTP polling fallback (used when WS not connected)
  useEffect(() => {
    if (audit && ['pending', 'running'].includes(audit.status) && !wsConnected) {
      pollRef.current = setInterval(fetchAudit, 3000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [audit?.status, wsConnected])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ color: 'var(--text-secondary)' }}>Loading audit results...</p>
    </div>
  )

  if (!audit) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Audit not found.</p>
      <button className="btn-primary" onClick={() => navigate('/dashboard')} style={{ marginTop: 16 }}>← Dashboard</button>
    </div>
  )

  if (audit.status !== 'complete') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, padding: 40 }}>
      <div className="glass-card" style={{ padding: 40, maxWidth: 520, width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="spinner" style={{ width: 28, height: 28, flexShrink: 0 }} />
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>Audit In Progress</h2>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
            color: wsConnected ? '#10b981' : '#94a3b8' }}>
            {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {wsConnected ? 'Live' : 'Polling'}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {wsProgress ? STAGE_LABELS[wsProgress.stage] || wsProgress.stage : '⏳ Queued...'}
            </span>
            <span style={{ fontWeight: 700, color: '#a5b4fc' }}>{wsProgress?.pct ?? 0}%</span>
          </div>
          <div className="progress-bar" style={{ height: 8 }}>
            <div className="progress-fill" style={{
              width: `${wsProgress?.pct ?? 5}%`,
              background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>

        {/* Live message */}
        <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          border: '1px solid rgba(99,102,241,0.2)', minHeight: 48 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {wsProgress?.message || 'Waiting to start analysis…'}
          </p>
        </div>

        {/* Stage pipeline indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['detect','metrics','shap','llm','pdf'] as const).map((s) => {
            const curPct = wsProgress?.pct ?? 0
            const stageThresholds: Record<string, number> = { detect: 20, metrics: 48, shap: 74, llm: 88, pdf: 100 }
            const done = curPct >= stageThresholds[s]
            const active = wsProgress?.stage === s
            return (
              <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 4, borderRadius: 2, marginBottom: 5, background:
                  done ? '#6366f1' : active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)',
                  transition: 'background 0.4s' }} />
                <span style={{ fontSize: 9, color: done ? '#a5b4fc' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {s}
                </span>
              </div>
            )
          })}
        </div>

        {audit.status === 'failed' && (
          <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>❌ Audit failed. Check server logs.</p>
        )}
      </div>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
    </div>
  )

  const metrics = audit.fairness_metrics || {}
  const llm = audit.llm_explanation || {}
  const shap = audit.shap_summary || {}
  const summary = audit.dataset_summary || {}
  const counterfactuals = audit.counterfactuals || []
  const metricsList = Object.values(metrics)
  const failCount = metricsList.filter((m: any) => m.pass_fail === 'FAIL').length
  const radarData = metricsList.slice(0, 6).map((m: any) => ({
    metric: m.metric_name.split(' ').slice(0, 2).join(' '),
    value: Math.min(100, Math.round(Math.abs(m.overall_value) / m.threshold * 100)),
  }))
  const tabs = ['overview', 'metrics', 'shap', 'ai', 'counterfactuals'] as const

  return (
    <div style={{ minHeight: '100vh', padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Drill-Down Modal */}
      {selectedCF && <CFModal cf={selectedCF} onClose={() => setSelectedCF(null)} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ padding: '8px 12px' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={20} color="#6366f1" />
              <h1 style={{ fontWeight: 800, fontSize: 18 }}>Audit Results</h1>
              <span className={`badge risk-${audit.risk_level}`}>{audit.risk_level}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {audit.org_context || audit.audit_id.slice(0, 16) + '...'} · {new Date(audit.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        {audit.report_url && (
          <a href={audit.report_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
            <Download size={16} /> Download PDF Report
          </a>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            background: activeTab === t ? 'rgba(99,102,241,0.3)' : 'transparent',
            color: activeTab === t ? '#a5b4fc' : 'var(--text-secondary)', transition: 'all 0.2s', textTransform: 'capitalize',
          }}>
            {t === 'ai' ? 'AI Explanation' : t === 'shap' ? 'SHAP Features' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-card" style={{ padding: 24 }}>
              <RiskGauge score={audit.risk_score} level={audit.risk_level} />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                {[
                  ['Rows', summary.row_count?.toLocaleString()],
                  ['Protected Attrs', audit.protected_attrs?.join(', ') || '—'],
                  ['Regulation', audit.regulation?.toUpperCase()],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Failing Metrics</span>
                  <span style={{ fontWeight: 600, color: failCount > 0 ? '#ef4444' : '#10b981' }}>{failCount} / {metricsList.length}</span>
                </div>
              </div>
            </div>
            {summary.class_balance && (
              <div className="glass-card" style={{ padding: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Label Distribution</h3>
                {Object.entries(summary.class_balance).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{((v as number) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${(v as number) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {llm.executive_summary && (
              <div className="glass-card" style={{ padding: 24, borderColor: 'rgba(99,102,241,0.3)' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <Info size={18} color="#6366f1" /><h3 style={{ fontWeight: 700 }}>AI Summary</h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 14 }}>{llm.executive_summary}</p>
              </div>
            )}
            {radarData.length > 0 && (
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Bias Severity Radar</h3>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.08)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Radar name="Severity %" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>Higher = more severe bias relative to threshold</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── METRICS TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'metrics' && (
        <div className="fade-in">
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div className="glass-card" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444' }}>{failCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Failing Metrics</div>
            </div>
            <div className="glass-card" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>{metricsList.length - failCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Passing Metrics</div>
            </div>
            <div className="glass-card" style={{ padding: 16, flex: 2, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: audit.risk_level === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>{audit.risk_level} RISK</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{audit.regulation?.toUpperCase()} compliance</div>
            </div>
            {/* Heatmap toggle */}
            <button onClick={() => setShowHeatmap(v => !v)} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 12, alignSelf: 'center' }}>
              {showHeatmap ? 'Hide' : 'Show'} Bias Heatmap
            </button>
          </div>

          {/* ── Bias Heatmap ── */}
          {showHeatmap && metricsList.length > 0 && (
            <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 6 }}>Bias Heatmap — Attribute × Metric</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Each cell shows PASS/FAIL and the metric value for that protected attribute. Quickly spot which combinations fail.
              </p>
              <BiasHeatmap metrics={metrics} />
            </div>
          )}

          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 20 }}>All Fairness Metrics</h3>
            {metricsList.length === 0
              ? <p style={{ color: 'var(--text-secondary)' }}>No metrics computed yet.</p>
              : metricsList.map((m: any, i) => <MetricRow key={i} metric={m} />)
            }
          </div>
        </div>
      )}

      {/* ── SHAP TAB ──────────────────────────────────────────────────────────── */}
      {activeTab === 'shap' && (
        <div className="fade-in">
          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            {/* Header row with export + beeswarm toggle */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Feature Importance</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  Features most influential in AI decisions — {shap.method === 'correlation_fallback' ? '(correlation-based)' : '(SHAP values)'}
                  {shap._warning && <span style={{ color: '#f59e0b', marginLeft: 8 }}>⚠ {shap._warning}</span>}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                <button onClick={() => setShowBeeswarm(v => !v)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }}>
                  {showBeeswarm ? 'Bar Chart' : 'Beeswarm Plot'}
                </button>
                <button onClick={() => exportShapCSV(shap, audit.audit_id)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileDown size={14} /> Export CSV
                </button>
              </div>
            </div>

            <div style={{ height: 280, marginTop: 16 }}>
              {showBeeswarm ? (
                <ShapBeeswarm topFeatures={shap.top_features} byGroup={shap.by_group} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={shap.top_features?.slice(0, 10).map((f: any) => ({ feature: f.feature, importance: f.importance })) || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis type="category" dataKey="feature" width={120} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                      {(shap.top_features || []).map((_: any, i: number) => (
                        <Cell key={i} fill={['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#3b82f6', '#22d3ee', '#a78bfa'][i % 10]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Per-group SHAP */}
          {shap.by_group && Object.entries(shap.by_group).map(([attr, groups]: [string, any]) => (
            <div key={attr} className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Feature Impact by {attr}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {Object.entries(groups).map(([group, features]: [string, any]) => (
                  <div key={group} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{group}</div>
                    {features.slice(0, 4).map((f: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{f.feature}</span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{f.importance?.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI EXPLANATION TAB ────────────────────────────────────────────────── */}
      {activeTab === 'ai' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {llm.executive_summary && (
            <div className="glass-card" style={{ padding: 28, borderColor: 'rgba(99,102,241,0.4)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: 12, color: '#a5b4fc' }}>📋 Executive Summary</h3>
              <p style={{ lineHeight: 1.8, fontSize: 15 }}>{llm.executive_summary}</p>
            </div>
          )}
          {llm.causal_hypotheses?.length > 0 && (
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 20 }}>🔍 Why Is Bias Occurring?</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {llm.causal_hypotheses.map((h: any, i: number) => (
                  <div key={i} style={{ borderLeft: `3px solid ${h.confidence === 'HIGH' ? '#10b981' : h.confidence === 'MEDIUM' ? '#f59e0b' : '#94a3b8'}`, paddingLeft: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{h.hypothesis}</span>
                      <span className={`badge ${h.confidence === 'HIGH' ? 'badge-pass' : 'badge-warn'}`} style={{ flexShrink: 0, marginLeft: 12 }}>{h.confidence}</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{h.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {llm.remediation_steps?.length > 0 && (
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 20 }}>🛠️ Recommended Actions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {llm.remediation_steps.map((s: any, i: number) => (
                  <div key={i} className="metric-card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: s.priority === 'HIGH' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)', color: s.priority === 'HIGH' ? '#ef4444' : '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.action}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.expected_impact}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <span className={`badge ${s.priority === 'HIGH' ? 'badge-fail' : 'badge-warn'}`}>{s.priority}</span>
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderColor: 'transparent' }}>Effort: {s.effort}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {llm.regulation_compliance && (
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 20 }}>⚖️ Regulation Compliance</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{llm.regulation_compliance.regulation_name}</span>
                <span className={`badge ${llm.regulation_compliance.status === 'PASS' ? 'badge-pass' : 'badge-fail'}`} style={{ fontSize: 14, padding: '6px 16px' }}>
                  {llm.regulation_compliance.status === 'PASS' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {llm.regulation_compliance.status}
                </span>
              </div>
              {llm.regulation_compliance.key_violations?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Key violations: </span>
                  {llm.regulation_compliance.key_violations.map((v: string, i: number) => (
                    <span key={i} className="badge badge-fail" style={{ marginLeft: 6, fontSize: 11 }}>{v}</span>
                  ))}
                </div>
              )}
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>{llm.regulation_compliance.recommendation}</p>
            </div>
          )}
          {llm._source === 'rule_based_fallback' && (
            <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
              ⚠️ Claude AI explanation unavailable — using rule-based analysis. Add ANTHROPIC_API_KEY in .env to enable full AI explanations.
            </div>
          )}
        </div>
      )}

      {/* ── COUNTERFACTUALS TAB ───────────────────────────────────────────────── */}
      {activeTab === 'counterfactuals' && (
        <div className="fade-in">
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Counterfactual Analysis</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>
              "What would have happened if this person had a different demographic attribute?" Sorted by largest decision impact first.
            </p>
            <p style={{ fontSize: 12, color: '#6366f1', marginBottom: 20 }}>
              💡 <strong>Click any row</strong> to see a detailed drill-down explanation.
            </p>
            {counterfactuals.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No counterfactuals available.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th><th>Attribute</th><th>Original</th><th>Counterfactual</th>
                    <th>Orig Score</th><th>CF Score</th><th>Delta</th><th>Decision Changed?</th>
                  </tr>
                </thead>
                <tbody>
                  {counterfactuals.slice(0, 25).map((cf: any, i: number) => (
                    <tr key={i} onClick={() => setSelectedCF(cf)}
                      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ fontSize: 12 }}>{cf.row_index}</td>
                      <td><span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'transparent' }}>{cf.attribute}</span></td>
                      <td style={{ fontSize: 12 }}>{cf.original_value}</td>
                      <td style={{ fontSize: 12, color: '#06b6d4' }}>{cf.counterfactual_value}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{cf.original_score?.toFixed(3)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{cf.counterfactual_score?.toFixed(3)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: cf.score_delta > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {cf.score_delta > 0 ? '+' : ''}{cf.score_delta?.toFixed(3)}
                      </td>
                      <td>
                        {cf.decision_changed
                          ? <span className="badge badge-fail"><AlertTriangle size={10} /> YES</span>
                          : <span className="badge badge-pass"><CheckCircle size={10} /> No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
