from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


# ---- Auth Schemas ----

class RegisterRequest(BaseModel):
    org_name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    org_id: str
    email: str


# ---- Audit Schemas ----

class AuditCreateRequest(BaseModel):
    label_column: str
    score_column: Optional[str] = None
    protected_attrs: Optional[List[str]] = None
    model_type: str = "classification"
    regulation: str = "generic"
    org_context: Optional[str] = None


class AuditStatusResponse(BaseModel):
    audit_id: str
    status: str
    stage: Optional[str] = None
    pct_complete: Optional[int] = None
    message: Optional[str] = None
    error_message: Optional[str] = None


class MetricResult(BaseModel):
    metric_name: str
    protected_attr: str
    overall_value: float
    disparity_ratio: Optional[float]
    pass_fail: str
    threshold: float
    by_group: Dict[str, float]


class AuditResultResponse(BaseModel):
    audit_id: str
    created_at: str
    status: str
    dataset_summary: Optional[Dict[str, Any]]
    fairness_metrics: Optional[Dict[str, Any]]
    shap_summary: Optional[Dict[str, Any]]
    counterfactuals: Optional[List[Dict[str, Any]]]
    llm_explanation: Optional[Dict[str, Any]]
    risk_score: Optional[float]
    risk_level: Optional[str]
    report_url: Optional[str]
    protected_attrs: Optional[List[str]]
    regulation: Optional[str]
    model_type: Optional[str]
    org_context: Optional[str]


class AuditListItem(BaseModel):
    audit_id: str
    status: str
    regulation: str
    model_type: str
    row_count: Optional[int]
    risk_score: Optional[float]
    risk_level: Optional[str]
    created_at: str
    org_context: Optional[str]
