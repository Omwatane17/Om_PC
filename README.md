<<<<<<< HEAD
# OM_PC
=======
# PradnyaChakshu — AI Bias Detection & Fairness Auditing Platform

> *"The smoke detector for AI discrimination."*

Upload any AI decision dataset → complete fairness audit in under 3 minutes → plain-English report → PDF compliance report.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+ 
- Node.js 18+
- (Optional) Anthropic API key for AI explanations

### 1. Backend Setup

```powershell
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment (edit ANTHROPIC_API_KEY if you have one)
copy .env.example .env

# Seed the database with demo user + demo audit
python seed.py

# Start the API server
uvicorn main:app --reload --port 8000
```

API will be live at: http://localhost:8000  
Swagger docs: http://localhost:8000/api/docs

### 2. Frontend Setup

```powershell
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend will be live at: http://localhost:5173

### 3. Demo Login

After running `seed.py`:
- Email: `demo@pradnyachakshu.io`
- Password: `demo1234`

---

## 🔑 Adding Claude AI Explanations

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Edit `backend/.env`: `ANTHROPIC_API_KEY=sk-ant-your-key-here`
3. Restart the backend

Without a key, the platform uses rule-based explanations (still fully functional).

---

## 📊 Features

| Feature | Status |
|---|---|
| CSV upload with auto-detection | ✅ |
| 6+ fairness metrics | ✅ |
| Demographic Parity | ✅ |
| Equalized Odds | ✅ |
| Disparate Impact (4/5ths rule) | ✅ |
| Equal Opportunity | ✅ |
| Predictive Parity | ✅ |
| Treatment Equality | ✅ |
| SHAP feature importance | ✅ |
| Counterfactual explanations | ✅ |
| Claude AI plain-English explanation | ✅ (needs API key) |
| Rule-based fallback explanation | ✅ |
| PDF compliance report | ✅ |
| EU AI Act / EEOC / CFPB frameworks | ✅ |
| Interactive bias visualizations | ✅ |
| Demo hiring bias dataset | ✅ |

---

## 🏗️ Architecture

```
Frontend (React + Vite + Tailwind)
    ↓ HTTP/JSON
Backend (FastAPI + Python)
    ├── Fairness Engine (Fairlearn + custom metrics)
    ├── SHAP Explainability (LinearExplainer)
    ├── Counterfactual Generator
    ├── LLM Explainer (Claude API / fallback)
    └── PDF Report (ReportLab)
Database: SQLite (MVP) → PostgreSQL (production)
```

---

## 📁 Project Structure

```
PradnyaChakshu/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Settings
│   ├── database.py          # SQLAlchemy
│   ├── models.py            # ORM models
│   ├── schemas.py           # Pydantic schemas
│   ├── seed.py              # Demo data seeder
│   ├── engine/
│   │   ├── detector.py      # Sensitive attr detection
│   │   ├── metrics.py       # Fairness metrics
│   │   ├── shap_module.py   # SHAP / feature importance
│   │   ├── counterfactual.py
│   │   ├── llm_explainer.py # Claude API
│   │   └── pdf_report.py    # ReportLab PDF
│   └── routers/
│       ├── auth.py
│       └── audits.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── Landing.tsx
        │   ├── Auth.tsx
        │   ├── Dashboard.tsx
        │   ├── Upload.tsx
        │   └── AuditResult.tsx
        ├── store/authStore.ts
        └── api/client.ts
```

---

## 🎯 Demo Flow (for judges)

1. Open http://localhost:5173
2. Click **"Use Demo Account"** → auto-login
3. View the pre-run **hiring bias audit** on the dashboard
4. Explore: Fairness Metrics → SHAP Features → AI Explanation → Counterfactuals
5. Download the **PDF compliance report**
6. (Optional) Upload your own CSV via **New Audit**

---

Built for H2S Hackathon · March 2026 · Unbiased AI Decision Track
>>>>>>> 6050054 (Initial commit)
