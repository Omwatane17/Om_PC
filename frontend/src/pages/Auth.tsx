import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck, Mail, Lock, Building, Eye, EyeOff, ArrowRight } from 'lucide-react'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'

export default function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, isAuthenticated } = useAuthStore()

  const [tab, setTab] = useState<'login' | 'register'>(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  const [form, setForm] = useState({
    email: '', password: '', org_name: ''
  })

  useEffect(() => { if (isAuthenticated) navigate('/dashboard') }, [isAuthenticated])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const url = tab === 'login' ? '/auth/login' : '/auth/register'
      const { data } = await api.post(url, form)
      login(data.access_token, data.user_id, data.org_id, data.email)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const prefillDemo = () => {
    setForm({ email: 'demo@pradnyachakshu.io', password: 'demo1234', org_name: '' })
    setTab('login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div className="orb orb-1" style={{ opacity: 0.15 }} />
      <div className="orb orb-2" style={{ opacity: 0.1 }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 10 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={32} color="#6366f1" />
            <span style={{ fontSize: 22, fontWeight: 800 }}>
              <span className="gradient-text">Pradnya</span>Chakshu
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 14 }}>
            AI Bias Detection Platform
          </p>
        </div>

        <div className="glass-card" style={{ padding: 32 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4 }}>
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: tab === t ? 'rgba(99,102,241,0.3)' : 'transparent',
                color: tab === t ? '#a5b4fc' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}>
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tab === 'register' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  <Building size={12} style={{ display: 'inline', marginRight: 4 }} />
                  Organisation Name
                </label>
                <input name="org_name" value={form.org_name} onChange={handleChange} required
                  className="form-input" placeholder="Acme Corp" />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                <Mail size={12} style={{ display: 'inline', marginRight: 4 }} />
                Email Address
              </label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required
                className="form-input" placeholder="you@company.com" />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input name="password" type={showPass ? 'text' : 'password'} value={form.password} onChange={handleChange} required minLength={6}
                  className="form-input" placeholder="••••••••" style={{ paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}
              style={{ justifyContent: 'center', width: '100%', opacity: loading ? 0.7 : 1 }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
              {tab === 'login' ? 'Sign In' : 'Create Account'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Demo login */}
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
              Want to try without signing up?
            </p>
            <button onClick={prefillDemo} className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
              Use Demo Account
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-secondary)', fontSize: 12 }}>
          No payment required · Data deleted after 24h · Privacy first
        </p>
      </div>
    </div>
  )
}
