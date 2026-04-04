import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { Upload as UploadIcon, FileText, ChevronRight, ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react'
import api from '../api/client'

const REGULATIONS = [
  { value: 'generic', label: 'Generic Fairness' },
  { value: 'eu_ai_act', label: 'EU AI Act' },
  { value: 'eeoc', label: 'EEOC Guidelines' },
  { value: 'cfpb', label: 'CFPB Fair Lending' },
]

const MODEL_TYPES = [
  { value: 'classification', label: 'Classification (hire/reject, approve/deny)' },
  { value: 'regression', label: 'Regression (score prediction)' },
  { value: 'ranking', label: 'Ranking (candidate ranking)' },
]

export default function Upload() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ headers: string[], rows: string[][] }>({ headers: [], rows: [] })
  const [config, setConfig] = useState({
    label_column: '',
    score_column: '',
    protected_attrs: '',
    model_type: 'classification',
    regulation: 'generic',
    org_context: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setFile(f)
    Papa.parse(f, {
      preview: 5,
      complete: (result) => {
        const headers = result.data[0] as string[]
        const rows = result.data.slice(1) as string[][]
        setPreview({ headers, rows })
        // Auto-suggest label column
        const labelGuess = headers.find(h => /hired|label|approved|outcome|target|decision|result/i.test(h))
        if (labelGuess) setConfig(c => ({ ...c, label_column: labelGuess }))
      }
    })
    setStep(2)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'] }, maxSize: 50 * 1024 * 1024
  })

  const handleSubmit = async () => {
    if (!file || !config.label_column) return
    setSubmitting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('label_column', config.label_column)
      if (config.score_column) formData.append('score_column', config.score_column)
      if (config.protected_attrs) formData.append('protected_attrs', config.protected_attrs)
      formData.append('model_type', config.model_type)
      formData.append('regulation', config.regulation)
      if (config.org_context) formData.append('org_context', config.org_context)

      const { data } = await api.post('/audits', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ padding: '8px 12px' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={24} color="#6366f1" />
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>New Bias Audit</h1>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 40, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 24 }}>
        {[
          { n: 1, label: 'Upload Dataset' },
          { n: 2, label: 'Configure' },
          { n: 3, label: 'Review & Run' },
        ].map(({ n, label }) => (
          <div key={n} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14,
              background: step >= n ? '#6366f1' : 'rgba(255,255,255,0.08)',
              color: step >= n ? '#fff' : 'var(--text-secondary)',
            }}>
              {step > n ? <CheckCircle size={16} /> : n}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: step >= n ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
            {n < 3 && <ChevronRight size={16} color="var(--text-secondary)" style={{ marginLeft: 'auto' }} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="fade-in">
          <div {...getRootProps()} style={{
            border: `2px dashed ${isDragActive ? '#6366f1' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 20, padding: '80px 40px', textAlign: 'center', cursor: 'pointer',
            background: isDragActive ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
          }}>
            <input {...getInputProps()} />
            <UploadIcon size={48} color="#6366f1" style={{ marginBottom: 20, opacity: 0.8 }} />
            <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 12 }}>
              {isDragActive ? 'Drop it here!' : 'Drag & drop your CSV file'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
              Upload any decision dataset — hiring results, loan approvals, diagnostic scores, etc.<br />
              Max 50MB · CSV format
            </p>
            <button className="btn-primary" type="button" style={{ pointerEvents: 'none' }}>
              <FileText size={16} /> Browse Files
            </button>
          </div>

          {/* Demo dataset quick start */}
          <div className="glass-card fade-in" style={{ padding: 24, marginTop: 24 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>🚀 Try the Demo Dataset</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              Sign in with the demo account — a pre-run hiring bias audit is already waiting on your dashboard.
            </p>
            <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
              View Demo Audit →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 2 && (
        <div className="fade-in">
          {/* File preview */}
          <div className="glass-card" style={{ padding: 20, marginBottom: 24, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FileText size={16} color="#6366f1" />
              <span style={{ fontWeight: 600 }}>{file?.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>({(file!.size / 1024).toFixed(1)} KB)</span>
            </div>
            <table className="data-table" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead>
                <tr>{preview.headers.map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 3).map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}>{cell || '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>Showing first 3 rows</p>
          </div>

          {/* Config form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Label / Outcome Column *
              </label>
              <select className="form-input" value={config.label_column} onChange={e => setConfig(c => ({ ...c, label_column: e.target.value }))}>
                <option value="">Select column...</option>
                {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>The column containing the AI decision (0/1 or true/false)</p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Score / Probability Column (optional)
              </label>
              <select className="form-input" value={config.score_column} onChange={e => setConfig(c => ({ ...c, score_column: e.target.value }))}>
                <option value="">None (use binary label)</option>
                {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Model Type
              </label>
              <select className="form-input" value={config.model_type} onChange={e => setConfig(c => ({ ...c, model_type: e.target.value }))}>
                {MODEL_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Regulation Framework
              </label>
              <select className="form-input" value={config.regulation} onChange={e => setConfig(c => ({ ...c, regulation: e.target.value }))}>
                {REGULATIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Protected Attributes (optional — leave blank to auto-detect)
              </label>
              <input className="form-input" value={config.protected_attrs} onChange={e => setConfig(c => ({ ...c, protected_attrs: e.target.value }))}
                placeholder="e.g. gender, race, age (comma-separated)" />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Context (optional)
              </label>
              <input className="form-input" value={config.org_context} onChange={e => setConfig(c => ({ ...c, org_context: e.target.value }))}
                placeholder="e.g. Resume screening model for software engineering roles" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn-primary" onClick={() => setStep(3)} disabled={!config.label_column}>
              Continue → Review
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Run */}
      {step === 3 && (
        <div className="fade-in">
          <div className="glass-card" style={{ padding: 28, marginBottom: 24 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 20, fontSize: 16 }}>Audit Configuration Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'File', value: file?.name },
                { label: 'Label Column', value: config.label_column },
                { label: 'Model Type', value: config.model_type },
                { label: 'Regulation', value: config.regulation },
                { label: 'Protected Attrs', value: config.protected_attrs || 'Auto-detect' },
                { label: 'Context', value: config.org_context || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20, marginBottom: 24, borderColor: 'rgba(99,102,241,0.3)' }}>
            <h4 style={{ fontWeight: 600, marginBottom: 8, color: '#a5b4fc' }}>What happens next:</h4>
            <ol style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
              <li>Detect sensitive attributes in your dataset</li>
              <li>Compute 6+ fairness metrics (Demographic Parity, Equalized Odds, Disparate Impact…)</li>
              <li>Run SHAP feature importance analysis</li>
              <li>Generate counterfactual explanations</li>
              <li>AI generates plain-English explanation & remediation steps</li>
              <li>Create downloadable PDF compliance report</li>
            </ol>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}
              style={{ opacity: submitting ? 0.7 : 1 }}>
              {submitting ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Starting Analysis...</> : <>🚀 Run Bias Audit</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
