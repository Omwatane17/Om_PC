import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Organisation(Base):
    __tablename__ = "organisations"
    org_id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    plan = Column(String(50), default="free")
    created_at = Column(DateTime, default=datetime.utcnow)
    users = relationship("User", back_populates="organisation")
    audits = relationship("Audit", back_populates="organisation")


class User(Base):
    __tablename__ = "users"
    user_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.org_id", ondelete="CASCADE"), nullable=False)
    email = Column(String(320), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(String(50), default="analyst")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)
    organisation = relationship("Organisation", back_populates="users")
    audits = relationship("Audit", back_populates="user")


class Audit(Base):
    __tablename__ = "audits"
    audit_id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.org_id"), nullable=False)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    status = Column(String(20), default="pending")  # pending|running|complete|failed
    model_type = Column(String(30), nullable=False)
    regulation = Column(String(30), default="generic")
    label_column = Column(String(255), nullable=False)
    score_column = Column(String(255), nullable=True)
    protected_attrs = Column(JSON, default=list)
    row_count = Column(Integer, nullable=True)
    col_count = Column(Integer, nullable=True)
    file_path = Column(Text, nullable=True)
    risk_score = Column(Float, nullable=True)
    risk_level = Column(String(10), nullable=True)
    error_message = Column(Text, nullable=True)
    org_context = Column(Text, nullable=True)
    dataset_summary = Column(JSON, nullable=True)
    fairness_metrics = Column(JSON, nullable=True)
    shap_summary = Column(JSON, nullable=True)
    counterfactuals = Column(JSON, nullable=True)
    llm_explanation = Column(JSON, nullable=True)
    report_path = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    organisation = relationship("Organisation", back_populates="audits")
    user = relationship("User", back_populates="audits")
