"""
Demo Dataset Seeder
Generates a realistic hiring bias dataset and runs an audit to pre-populate the demo.
"""
import sys
import os
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
from models import Organisation, User, Audit
from routers.auth import hash_password
from engine.detector import detect_sensitive_attributes, profile_dataframe
from engine.metrics import compute_all_metrics, compute_risk_score
from engine.shap_module import compute_shap_summary
from engine.counterfactual import generate_counterfactuals
from engine.llm_explainer import call_llm_explainer
from engine.pdf_report import generate_pdf_report
from config import settings
from datetime import datetime
import uuid

Base.metadata.create_all(bind=engine)

# ── Generate hiring bias CSV ─────────────────────────────────────────────────
np.random.seed(42)
N = 2000

gender = np.random.choice(["Male", "Female"], size=N, p=[0.55, 0.45])
race = np.random.choice(["White", "Black", "Asian", "Hispanic"], size=N, p=[0.52, 0.18, 0.18, 0.12])
age = np.random.randint(22, 58, size=N)
experience_years = np.clip(np.random.normal(age - 22, 3), 0, 35).astype(int)
education = np.random.choice(["High School", "Bachelor", "Master", "PhD"], size=N, p=[0.25, 0.45, 0.22, 0.08])
skills_score = np.random.randint(40, 100, size=N)
interview_score = np.random.randint(30, 100, size=N)

# Base probability of hire from merit
base_prob = (
    0.2
    + 0.003 * experience_years
    + 0.003 * (skills_score - 40)
    + 0.003 * (interview_score - 30)
    + np.where(education == "Master", 0.08, 0)
    + np.where(education == "PhD", 0.15, 0)
    + np.where(education == "Bachelor", 0.04, 0)
)

# BIAS: penalise women and Black applicants (the bias we want to DETECT)
bias = (
    np.where(gender == "Female", -0.20, 0)
    + np.where(race == "Black", -0.18, 0)
    + np.where(race == "Hispanic", -0.08, 0)
)
prob = np.clip(base_prob + bias, 0.02, 0.98)
hired = (np.random.rand(N) < prob).astype(int)

df = pd.DataFrame({
    "age": age,
    "gender": gender,
    "race": race,
    "experience_years": experience_years,
    "education": education,
    "skills_score": skills_score,
    "interview_score": interview_score,
    "hired": hired,
})

data_dir = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(data_dir, exist_ok=True)
csv_path = os.path.join(data_dir, "hiring_gender_bias.csv")
df.to_csv(csv_path, index=False)
print(f"✅ Dataset saved: {csv_path} ({N} rows)")
print(f"   Hire rate by gender: {df.groupby('gender')['hired'].mean().to_dict()}")
print(f"   Hire rate by race:   {df.groupby('race')['hired'].mean().to_dict()}")

# ── Create demo org + user ──────────────────────────────────────────────────
db = SessionLocal()

# Check if demo already exists
demo_user = db.query(User).filter(User.email == "demo@pradnyachakshu.io").first()
if not demo_user:
    org = Organisation(name="PradnyaChakshu Demo Org")
    db.add(org)
    db.flush()
    demo_user = User(
        org_id=org.org_id,
        email="demo@pradnyachakshu.io",
        password_hash=hash_password("demo1234"),
        role="admin",
    )
    db.add(demo_user)
    db.commit()
    db.refresh(demo_user)
    print(f"✅ Demo user created: demo@pradnyachakshu.io / demo1234")
else:
    print(f"ℹ️  Demo user already exists")

# ── Run the audit pipeline ──────────────────────────────────────────────────
print("🔄 Running audit pipeline...")
label_col = "hired"
protected_attrs = detect_sensitive_attributes(df)
print(f"   Detected protected attributes: {protected_attrs}")

dataset_summary = profile_dataframe(df, protected_attrs, label_col)
fairness_metrics = compute_all_metrics(df, label_col, protected_attrs, "generic")
risk_score, risk_level = compute_risk_score(fairness_metrics)
print(f"   Risk score: {risk_score} ({risk_level})")

shap_summary = compute_shap_summary(df, label_col, protected_attrs)
counterfactuals = generate_counterfactuals(df, label_col, protected_attrs)

audit_context = {
    "audit_id": str(uuid.uuid4()),
    "org_context": "Resume screening model for software engineering roles",
    "model_type": "classification",
    "regulation": "generic",
    "row_count": len(df),
    "protected_attrs": protected_attrs,
    "risk_score": risk_score,
    "risk_level": risk_level,
    "fairness_metrics": fairness_metrics,
    "shap_summary": shap_summary,
    "counterfactuals": counterfactuals,
    "dataset_summary": dataset_summary,
}

llm_explanation = call_llm_explainer(audit_context, settings.anthropic_api_key)

reports_dir = os.path.join(os.path.dirname(__file__), "reports")
report_path = generate_pdf_report({**audit_context, "llm_explanation": llm_explanation}, reports_dir)

audit = Audit(
    audit_id=audit_context["audit_id"],
    org_id=demo_user.org_id,
    user_id=demo_user.user_id,
    status="complete",
    model_type="classification",
    regulation="generic",
    label_column=label_col,
    protected_attrs=protected_attrs,
    row_count=len(df),
    col_count=len(df.columns),
    file_path=csv_path,
    dataset_summary=dataset_summary,
    fairness_metrics=fairness_metrics,
    shap_summary=shap_summary,
    counterfactuals=counterfactuals,
    llm_explanation=llm_explanation,
    risk_score=risk_score,
    risk_level=risk_level,
    report_path=report_path,
    org_context="Resume screening model for software engineering roles",
    completed_at=datetime.utcnow(),
)
db.add(audit)
db.commit()
db.close()

print(f"✅ Demo audit saved (ID: {audit_context['audit_id'][:8]}...)")
print(f"✅ PDF report: {report_path}")
print("\n🚀 Seeding complete! Start the backend: uvicorn main:app --reload")
print("   Login with: demo@pradnyachakshu.io / demo1234")
