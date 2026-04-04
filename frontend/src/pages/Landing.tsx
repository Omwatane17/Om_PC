import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Zap, FileText, Search, BarChart2, ArrowRight, Eye } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const METRICS = [
  'Demographic Parity', 'Equalized Odds', 'Equal Opportunity', 'Disparate Impact',
  'Predictive Parity', 'Treatment Equality',
]

const DOMAINS = [
  { icon: '💼', title: 'Hiring', desc: 'Resume screening rejecting women & minorities at 2.5× rate' },
  { icon: '🏦', title: 'Lending', desc: 'Credit models denying Black applicants at 2.7× the rate' },
  { icon: '🏥', title: 'Healthcare', desc: 'Diagnostic AI underperforming for older & darker-skinned patients' },
  { icon: '⚖️', title: 'Criminal Justice', desc: 'Recidivism tools scoring minorities as high-risk at 2× the rate' },
]

const STEPS = [
  { num: '01', icon: <Zap size={20} />, title: 'Upload', desc: 'Drag & drop your CSV or connect an API endpoint' },
  { num: '02', icon: <Search size={20} />, title: 'Detect', desc: 'Auto-detects protected attributes: gender, race, age, ZIP' },
  { num: '03', icon: <BarChart2 size={20} />, title: 'Audit', desc: 'Computes 6+ fairness metrics across all demographic groups' },
  { num: '04', icon: <Eye size={20} />, title: 'Explain', desc: 'AI generates plain-English causal bias explanations' },
  { num: '05', icon: <FileText size={20} />, title: 'Report', desc: 'One-click compliance PDF for EU AI Act, EEOC, CFPB' },
]

export default function Landing() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      {/* Animated background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Navigation */}
      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={28} color="#6366f1" />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px' }}>
            <span className="gradient-text">Pradnya</span>Chakshu
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAuthenticated ? (
            <>
              <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', fontSize: 13 }}>Dashboard</button>
              <button className="btn-primary" onClick={() => navigate('/upload')} style={{ padding: '8px 16px', fontSize: 13 }}>New Audit</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => navigate('/auth')} style={{ padding: '8px 16px', fontSize: 13 }}>Sign In</button>
              <button className="btn-primary" onClick={() => navigate('/auth?tab=register')} style={{ padding: '8px 16px', fontSize: 13 }}>Get Started Free</button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '100px 40px 80px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: '6px 16px', marginBottom: 24, fontSize: 12, fontWeight: 600, color: '#a5b4fc', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          <div className="pulse-dot" />
          Hackathon MVP · Unbiased AI Track
        </div>

        <h1 style={{ fontSize: 'clamp(42px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-2px', marginBottom: 24 }}>
          The smoke detector for<br />
          <span className="gradient-text">AI discrimination</span>
        </h1>

        <p style={{ fontSize: 18, color: 'var(--text-secondary)', maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Upload your model's outputs. Get a complete fairness audit in under 3 minutes.
          A plain-English report you can actually act on — and a PDF for regulators.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ fontSize: 16, padding: '14px 32px' }} onClick={() => navigate(isAuthenticated ? '/upload' : '/auth?tab=register')}>
            Start Free Audit <ArrowRight size={18} />
          </button>
          <button className="btn-secondary" style={{ fontSize: 16, padding: '14px 32px' }} onClick={() => navigate('/auth')}>
            View Demo →
          </button>
        </div>

        {/* Metrics strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 60 }}>
          {METRICS.map(m => (
            <span key={m} className="stat-chip" style={{ fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
              {m}
            </span>
          ))}
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'center', gap: 0, borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        {[
          { value: '73%', label: 'Companies use AI hiring with no bias audit' },
          { value: '2.7×', label: 'Loan denial rate disparity for Black applicants' },
          { value: '$4.2B', label: 'In AI discrimination lawsuits since 2020' },
          { value: '< 3min', label: 'From upload to complete bias audit' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: '28px 20px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#a5b4fc' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section style={{ position: 'relative', zIndex: 10, padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>How It Works</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 56 }}>Five steps from upload to compliance report</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
          {STEPS.map((step) => (
            <div key={step.num} className="glass-card fade-in" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 12, letterSpacing: '0.1em' }}>{step.num}</div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#a5b4fc' }}>{step.icon}</div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{step.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Affected domains */}
      <section style={{ position: 'relative', zIndex: 10, padding: '0 40px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>Where Bias Hides</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 48 }}>Real harm in sectors that matter most</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 20 }}>
          {DOMAINS.map((d) => (
            <div key={d.title} className="glass-card" style={{ padding: 28 }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>{d.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{d.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '60px 40px 100px' }}>
        <div className="glass-card" style={{ maxWidth: 600, margin: '0 auto', padding: '48px 40px' }}>
          <ShieldCheck size={40} color="#6366f1" style={{ marginBottom: 20 }} />
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Ready to audit your AI?</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.7 }}>
            Upload any decision dataset and get a full bias report in minutes.
            Free to use, no credit card required.
          </p>
          <button className="btn-primary" style={{ fontSize: 16, padding: '14px 36px' }} onClick={() => navigate(isAuthenticated ? '/upload' : '/auth?tab=register')}>
            Start Your First Audit <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '24px', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 12 }}>
        PradnyaChakshu · AI Bias Detection Platform · Built for H2S Hackathon · March 2026
      </footer>
    </div>
  )
}
