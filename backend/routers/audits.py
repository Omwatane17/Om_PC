import asyncio
import os
import shutil
import uuid
from datetime import datetime
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Audit, User
from schemas import AuditCreateRequest, AuditStatusResponse, AuditResultResponse, AuditListItem
from routers.auth import get_current_user
from config import settings
from engine.detector import detect_sensitive_attributes, profile_dataframe
from engine.metrics import compute_all_metrics, compute_risk_score
from engine.shap_module import compute_shap_summary
from engine.counterfactual import generate_counterfactuals
from engine.llm_explainer import call_llm_explainer
from engine.pdf_report import generate_pdf_report
from ws_manager import ws_manager

router = APIRouter(prefix="/audits", tags=["audits"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
REPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)


# ─── Helpers: run emit in the event loop ─────────────────────────────────────

def _emit(audit_id: str, event: str, stage: str, pct: int, message: str, payload: dict = None):
    """Fire-and-forget WebSocket emit from a sync background thread."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit(audit_id, event, stage, pct, message, payload or {}),
                loop,
            )
    except Exception:
        pass  # Never let WS errors kill the analysis


# ─── Background Analysis Task ────────────────────────────────────────────────

def run_audit_analysis(
    audit_id: str,
    file_path: str,
    label_col: str,
    score_col: Optional[str],
    protected_attrs: Optional[List[str]],
    model_type: str,
    regulation: str,
    org_context: Optional[str],
    db: Session,
):
    """Full fairness analysis pipeline — runs in background, emits WS progress."""
    try:
        # Load dataset
        df = pd.read_csv(file_path)

        audit = db.query(Audit).filter(Audit.audit_id == audit_id).first()
        if not audit:
            return
        audit.status = "running"
        audit.row_count = len(df)
        audit.col_count = len(df.columns)
        db.commit()

        # Stage 1: Detect sensitive attributes (10%)
        _emit(audit_id, "progress", "detect", 10, "Detecting sensitive attributes...")
        if not protected_attrs:
            protected_attrs = detect_sensitive_attributes(df)
        if not protected_attrs:
            protected_attrs = []
        dataset_summary = profile_dataframe(df, protected_attrs, label_col)
        _emit(audit_id, "progress", "detect", 20,
              f"Detected {len(protected_attrs)} protected attribute(s): {', '.join(protected_attrs)}")

        # Stage 2: Fairness metrics (30–45%)
        _emit(audit_id, "progress", "metrics", 30, "Computing fairness metrics...")
        fairness_metrics = compute_all_metrics(df, label_col, protected_attrs, regulation, score_col)
        risk_score, risk_level = compute_risk_score(fairness_metrics)
        fail_count = sum(1 for m in fairness_metrics.values() if m.get("pass_fail") == "FAIL")
        _emit(audit_id, "progress", "metrics", 48,
              f"Computed {len(fairness_metrics)} metrics — {fail_count} failing. Risk: {risk_level}")

        # Stage 3: SHAP (55%)
        _emit(audit_id, "progress", "shap", 55, "Computing SHAP feature importance...")
        shap_summary = compute_shap_summary(df, label_col, protected_attrs)
        _emit(audit_id, "progress", "shap", 63, "SHAP analysis complete.")

        # Stage 4: Counterfactuals (68%)
        _emit(audit_id, "progress", "shap", 68, "Generating counterfactual explanations...")
        counterfactuals = generate_counterfactuals(df, label_col, protected_attrs)
        _emit(audit_id, "progress", "shap", 74,
              f"Generated {len(counterfactuals)} counterfactual scenarios.")

        # Stage 5: LLM explanation (80%)
        _emit(audit_id, "progress", "llm", 80, "Generating AI explanation via Claude...")
        audit_context = {
            "audit_id": audit_id, "org_context": org_context, "model_type": model_type,
            "regulation": regulation, "row_count": len(df), "protected_attrs": protected_attrs,
            "risk_score": risk_score, "risk_level": risk_level,
            "fairness_metrics": fairness_metrics, "shap_summary": shap_summary,
            "counterfactuals": counterfactuals, "dataset_summary": dataset_summary,
        }
        llm_explanation = call_llm_explainer(audit_context, settings.anthropic_api_key)
        _emit(audit_id, "progress", "llm", 88, "AI explanation generated.")

        # Stage 6: PDF report (92%)
        _emit(audit_id, "progress", "pdf", 92, "Generating PDF compliance report...")
        report_path = generate_pdf_report(
            {**audit_context, "llm_explanation": llm_explanation}, REPORT_DIR
        )
        _emit(audit_id, "progress", "pdf", 97, "PDF report ready.")

        # Done
        audit.status = "complete"
        audit.protected_attrs = protected_attrs
        audit.dataset_summary = dataset_summary
        audit.fairness_metrics = fairness_metrics
        audit.shap_summary = shap_summary
        audit.counterfactuals = counterfactuals
        audit.llm_explanation = llm_explanation
        audit.risk_score = risk_score
        audit.risk_level = risk_level
        audit.report_path = report_path
        audit.completed_at = datetime.utcnow()
        db.commit()

        _emit(audit_id, "done", "pdf", 100, "Audit complete.", {"risk_score": risk_score, "risk_level": risk_level})

    except Exception as e:
        audit = db.query(Audit).filter(Audit.audit_id == audit_id).first()
        if audit:
            audit.status = "failed"
            audit.error_message = str(e)
            db.commit()
        _emit(audit_id, "error", "failed", 0, f"Audit failed: {str(e)[:200]}")
        raise


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("", response_model=AuditStatusResponse, status_code=202)
async def create_audit(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    label_column: str = Form(...),
    score_column: Optional[str] = Form(None),
    protected_attrs: Optional[str] = Form(None),  # comma-separated
    model_type: str = Form("classification"),
    regulation: str = Form("generic"),
    org_context: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate file type
    if not file.filename.endswith((".csv", ".json")):
        raise HTTPException(400, "Only CSV and JSON files are supported")

    # Save file
    audit_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{audit_id}_{file.filename}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse protected attrs
    attrs_list = None
    if protected_attrs:
        attrs_list = [a.strip() for a in protected_attrs.split(",") if a.strip()]

    # Create audit record
    audit = Audit(
        audit_id=audit_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        status="pending",
        model_type=model_type,
        regulation=regulation,
        label_column=label_column,
        score_column=score_column,
        protected_attrs=attrs_list or [],
        file_path=file_path,
        org_context=org_context,
    )
    db.add(audit)
    db.commit()

    # Run analysis in background
    background_tasks.add_task(
        run_audit_analysis,
        audit_id, file_path, label_column, score_column,
        attrs_list, model_type, regulation, org_context, db,
    )

    return AuditStatusResponse(
        audit_id=audit_id,
        status="pending",
        stage="queued",
        pct_complete=0,
        message="Audit queued. Poll /status for progress.",
    )


@router.get("", response_model=List[AuditListItem])
def list_audits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audits = (
        db.query(Audit)
        .filter(Audit.org_id == current_user.org_id)
        .order_by(Audit.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        AuditListItem(
            audit_id=a.audit_id,
            status=a.status,
            regulation=a.regulation,
            model_type=a.model_type,
            row_count=a.row_count,
            risk_score=a.risk_score,
            risk_level=a.risk_level,
            created_at=a.created_at.isoformat(),
            org_context=a.org_context,
        )
        for a in audits
    ]


@router.get("/demo", response_model=AuditResultResponse)
def get_demo_audit(
    db: Session = Depends(get_db),
):
    """Return a pre-computed demo audit without auth (for landing page)."""
    # Find latest complete audit (fallback: 404)
    audit = (
        db.query(Audit)
        .filter(Audit.status == "complete")
        .order_by(Audit.created_at.desc())
        .first()
    )
    if not audit:
        raise HTTPException(404, "No demo audit available yet. Run the seeder first.")
    return _audit_to_response(audit)


@router.get("/{audit_id}/status", response_model=AuditStatusResponse)
def get_audit_status(
    audit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit = _get_audit_or_404(audit_id, current_user.org_id, db)
    stage_map = {"pending": "queued", "running": "analyzing", "complete": "done", "failed": "failed"}
    pct_map = {"pending": 5, "running": 50, "complete": 100, "failed": 0}
    return AuditStatusResponse(
        audit_id=audit_id,
        status=audit.status,
        stage=stage_map.get(audit.status),
        pct_complete=pct_map.get(audit.status, 0),
        error_message=audit.error_message,
    )


@router.get("/{audit_id}", response_model=AuditResultResponse)
def get_audit_result(
    audit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit = _get_audit_or_404(audit_id, current_user.org_id, db)
    return _audit_to_response(audit)


@router.get("/{audit_id}/report")
def download_report(
    audit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit = _get_audit_or_404(audit_id, current_user.org_id, db)
    if audit.status != "complete":
        raise HTTPException(400, "Audit not yet complete")
    if not audit.report_path or not os.path.exists(audit.report_path):
        raise HTTPException(404, "Report file not found")
    return FileResponse(
        audit.report_path,
        media_type="application/pdf",
        filename=f"pradnyachakshu_report_{audit_id[:8]}.pdf",
    )


@router.delete("/{audit_id}", status_code=204)
def delete_audit(
    audit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit = _get_audit_or_404(audit_id, current_user.org_id, db)
    if audit.file_path and os.path.exists(audit.file_path):
        os.remove(audit.file_path)
    if audit.report_path and os.path.exists(audit.report_path):
        os.remove(audit.report_path)
    db.delete(audit)
    db.commit()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_audit_or_404(audit_id: str, org_id: str, db: Session) -> Audit:
    audit = db.query(Audit).filter(Audit.audit_id == audit_id).first()
    if not audit:
        raise HTTPException(404, "Audit not found")
    if audit.org_id != org_id:
        raise HTTPException(403, "Access denied")
    return audit


def _audit_to_response(audit: Audit) -> AuditResultResponse:
    report_url = None
    if audit.report_path and os.path.exists(audit.report_path):
        report_url = f"/api/v1/audits/{audit.audit_id}/report"
    return AuditResultResponse(
        audit_id=audit.audit_id,
        created_at=audit.created_at.isoformat(),
        status=audit.status,
        dataset_summary=audit.dataset_summary,
        fairness_metrics=audit.fairness_metrics,
        shap_summary=audit.shap_summary,
        counterfactuals=audit.counterfactuals,
        llm_explanation=audit.llm_explanation,
        risk_score=audit.risk_score,
        risk_level=audit.risk_level,
        report_url=report_url,
        protected_attrs=audit.protected_attrs,
        regulation=audit.regulation,
        model_type=audit.model_type,
        org_context=audit.org_context,
    )
