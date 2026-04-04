import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Plus, LogOut, Clock, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'

interface AuditItem {
  audit_id: string
  status: string
  regulation: string
  model_type: string
  row_count: number | null
  risk_score: number | null
  risk_level: string | null
  created_at: string
  org_context: string | null
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null
  return (
    <span className={`badge risk-${level}`}>
      {level === 'LOW' ? <CheckCircle size={10} /> : level === 'CRITICAL' ? <AlertTriangle size={10} /> : null}
      {level}
    </span>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'complete') return <CheckCircle size={16} color="#10b981" />
  if (status === 'failed') return <XCircle size={16} color="#ef4444" />
  return <Clock size={16} color="#f59e0b" />
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { email, logout } = useAuthStore()
  const [audits, setAudits] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadAudits = async () => {
    try {
      const { data } = await api.get('/audits')
      setAudits(data)
    } catch { } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudits()
    const interval = setInterval(() => {
      // Auto-refresh if any audit is pending/running
      setAudits(prev => {
        const hasPending = prev.some(a => ['pending', 'running'].includes(a.status))
        if (hasPending) loadAudits()
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => { logout(); navigate('/') }

  return (
    <div style={{ minHeight: '100vh', padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={28} color="#6366f1" />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800 }}><span className="gradient-text">Pradnya</span>Chakshu</h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{email}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => loadAudits()} title="Refresh" style={{ padding: '8px 12px' }}>
            <RefreshCw size={16} />
          </button>
          <button className="btn-primary" onClick={() => navigate('/upload')}>
            <Plus size={16} /> New Audit
          </button>
          <button className="btn-secondary" onClick={handleLogout} style={{ padding: '8px 12px' }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Audits', value: audits.length },
          { label: 'Complete', value: audits.filter(a => a.status === 'complete').length, color: '#10b981' },
          { label: 'High/Critical Risk', value: audits.filter(a => ['HIGH', 'CRITICAL'].includes(a.risk_level || '')).length, color: '#ef4444' },
          { label: 'Avg Risk Score', value: audits.filter(a => a.risk_score !== null).length ? Math.round(audits.filter(a => a.risk_score !== null).reduce((s, a) => s + (a.risk_score || 0), 0) / audits.filter(a => a.risk_score !== null).length) : '-' },
        ].map((s) => (
          <div key={s.label} className="glass-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Audits list */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>Recent Audits</h2>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: 16 }}>Loading audits...</p>
          </div>
        ) : audits.length === 0 ? (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <ShieldCheck size={48} color="#6366f1" style={{ marginBottom: 16, opacity: 0.5 }} />
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>No audits yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
              Upload your first dataset and start detecting bias
            </p>
            <button className="btn-primary" onClick={() => navigate('/upload')}>
              <Plus size={16} /> Run Your First Audit
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Context</th>
                <th>Model Type</th>
                <th>Regulation</th>
                <th>Rows</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {audits.map(a => (
                <tr key={a.audit_id} style={{ cursor: 'pointer' }} onClick={() => a.status === 'complete' && navigate(`/audit/${a.audit_id}`)}>
                  <td><StatusIcon status={a.status} /></td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {a.org_context || `${a.audit_id.slice(0, 8)}...`}
                  </td>
                  <td><span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'transparent', fontSize: 11 }}>{a.model_type}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.regulation.toUpperCase().replace('_', ' ')}</td>
                  <td style={{ fontSize: 12 }}>{a.row_count?.toLocaleString() || '—'}</td>
                  <td><RiskBadge level={a.risk_level} /></td>
                  <td style={{ fontWeight: 700, fontSize: 14 }}>{a.risk_score != null ? `${a.risk_score}` : '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                  <td>
                    {a.status === 'complete' ? (
                      <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); navigate(`/audit/${a.audit_id}`) }}>
                        View →
                      </button>
                    ) : a.status === 'pending' || a.status === 'running' ? (
                      <span style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div className="spinner" style={{ width: 12, height: 12 }} /> Analyzing
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#ef4444' }}>Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
