"""
PDF Compliance Report Generator using ReportLab.
"""
import io
import os
from datetime import datetime
from typing import Dict, Any, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Color palette
BRAND_BLUE = colors.HexColor("#4F46E5")
BRAND_DARK = colors.HexColor("#1E1B4B")
PASS_GREEN = colors.HexColor("#10B981")
FAIL_RED = colors.HexColor("#EF4444")
WARN_AMBER = colors.HexColor("#F59E0B")
LIGHT_GREY = colors.HexColor("#F3F4F6")
MID_GREY = colors.HexColor("#9CA3AF")


def _risk_color(level: str) -> colors.Color:
    return {
        "LOW": PASS_GREEN,
        "MEDIUM": WARN_AMBER,
        "HIGH": colors.HexColor("#F97316"),
        "CRITICAL": FAIL_RED,
    }.get(level, MID_GREY)


def _pf_color(pf: str) -> colors.Color:
    return PASS_GREEN if pf == "PASS" else FAIL_RED


def generate_pdf_report(audit_data: Dict[str, Any], output_dir: str) -> str:
    """Generate a PDF compliance report and return the file path."""
    os.makedirs(output_dir, exist_ok=True)
    audit_id = audit_data.get("audit_id", "unknown")
    output_path = os.path.join(output_dir, f"report_{audit_id}.pdf")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=22, textColor=BRAND_DARK, spaceAfter=6,
        fontName="Helvetica-Bold",
    )
    h1_style = ParagraphStyle(
        "H1", parent=styles["Heading1"],
        fontSize=14, textColor=BRAND_BLUE, spaceBefore=16, spaceAfter=6,
        fontName="Helvetica-Bold",
    )
    h2_style = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontSize=11, textColor=BRAND_DARK, spaceBefore=10, spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontSize=9, spaceAfter=4, leading=14,
    )
    small_style = ParagraphStyle(
        "Small", parent=styles["Normal"],
        fontSize=8, textColor=MID_GREY,
    )

    story = []
    regulation_map = {
        "generic": "Fairness Standards",
        "eu_ai_act": "EU AI Act (Article 9, 10)",
        "eeoc": "EEOC Uniform Guidelines",
        "cfpb": "CFPB Fair Lending Standards",
    }
    regulation = audit_data.get("regulation", "generic")
    risk_level = audit_data.get("risk_level", "UNKNOWN")
    risk_score = audit_data.get("risk_score", 0)

    # ── HEADER ──────────────────────────────────────────────────────────────
    story.append(Paragraph("PradnyaChakshu", title_style))
    story.append(Paragraph("AI Bias & Fairness Audit Report", h2_style))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND_BLUE))
    story.append(Spacer(1, 0.4 * cm))

    meta_data = [
        ["Audit ID", audit_id],
        ["Report Date", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
        ["Regulation", regulation_map.get(regulation, regulation)],
        ["Model Type", audit_data.get("model_type", "classification").title()],
        ["Protected Attributes", ", ".join(audit_data.get("protected_attrs", []))],
        ["Dataset Rows", str(audit_data.get("dataset_summary", {}).get("row_count", "N/A"))],
    ]
    meta_table = Table(meta_data, colWidths=[5 * cm, 11 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), BRAND_DARK),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_GREY, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── RISK SCORE BANNER ────────────────────────────────────────────────────
    rc = _risk_color(risk_level)
    risk_table = Table(
        [[Paragraph(f"OVERALL RISK SCORE: {risk_score}/100", h1_style),
          Paragraph(risk_level, h1_style)]],
        colWidths=[11 * cm, 5 * cm],
    )
    risk_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), rc),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(risk_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── EXECUTIVE SUMMARY ────────────────────────────────────────────────────
    llm = audit_data.get("llm_explanation", {}) or {}
    if llm.get("executive_summary"):
        story.append(Paragraph("Executive Summary", h1_style))
        story.append(Paragraph(llm["executive_summary"], body_style))
        story.append(Spacer(1, 0.3 * cm))

    # ── FAIRNESS METRICS TABLE ───────────────────────────────────────────────
    story.append(Paragraph("Fairness Metrics Results", h1_style))
    metrics = audit_data.get("fairness_metrics", {}) or {}
    if metrics:
        header = ["Metric", "Attribute", "Value", "Threshold", "Result"]
        rows = [header]
        for key, m in metrics.items():
            pf = m.get("pass_fail", "?")
            rows.append([
                Paragraph(m.get("metric_name", key), small_style),
                m.get("protected_attr", ""),
                f"{m.get('overall_value', 0):.4f}",
                f"{m.get('threshold', 0):.2f}",
                Paragraph(f"<b>{pf}</b>", ParagraphStyle(
                    "PF", parent=small_style,
                    textColor=PASS_GREEN if pf == "PASS" else FAIL_RED,
                )),
            ])
        metric_table = Table(rows, colWidths=[5 * cm, 3 * cm, 2.5 * cm, 2.5 * cm, 2 * cm])
        metric_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GREY, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ]))
        story.append(metric_table)
    story.append(Spacer(1, 0.4 * cm))

    # ── CAUSAL HYPOTHESES ────────────────────────────────────────────────────
    hypotheses = llm.get("causal_hypotheses", [])
    if hypotheses:
        story.append(Paragraph("Bias Causal Analysis", h1_style))
        for i, h in enumerate(hypotheses, 1):
            conf = h.get("confidence", "MEDIUM")
            conf_hex = '#10b981' if conf == 'HIGH' else ('#f59e0b' if conf == 'MEDIUM' else '#9CA3AF')
            story.append(Paragraph(
                f"<b>{i}. {h.get('hypothesis', '')}</b> "
                f"[<font color='{conf_hex}'>Confidence: {conf}</font>]",
                body_style,
            ))
            story.append(Paragraph(f"Evidence: {h.get('evidence', '')}", small_style))
            story.append(Spacer(1, 0.2 * cm))

    # ── REMEDIATION STEPS ────────────────────────────────────────────────────
    steps = llm.get("remediation_steps", [])
    if steps:
        story.append(Paragraph("Recommended Remediation Steps", h1_style))
        step_rows = [["#", "Action", "Priority", "Effort", "Expected Impact"]]
        for i, s in enumerate(steps, 1):
            step_rows.append([
                str(i),
                Paragraph(s.get("action", ""), small_style),
                s.get("priority", ""),
                s.get("effort", ""),
                Paragraph(s.get("expected_impact", ""), small_style),
            ])
        step_table = Table(step_rows, colWidths=[0.7 * cm, 6 * cm, 2 * cm, 2 * cm, 4.3 * cm])
        step_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GREY, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(step_table)
        story.append(Spacer(1, 0.4 * cm))

    # ── REGULATION COMPLIANCE ─────────────────────────────────────────────────
    reg_comp = llm.get("regulation_compliance", {})
    if reg_comp:
        story.append(Paragraph("Regulation Compliance", h1_style))
        status = reg_comp.get("status", "UNKNOWN")
        status_hex = '#10b981' if status == 'PASS' else ('#f59e0b' if status == 'PARTIAL' else '#ef4444')
        story.append(Paragraph(
            f"<b>{reg_comp.get('regulation_name', '')}:</b> "
            f"<font color='{status_hex}'><b>{status}</b></font>",
            body_style,
        ))
        violations = reg_comp.get("key_violations", [])
        if violations:
            story.append(Paragraph(f"Key violations: {', '.join(violations)}", small_style))
        rec = reg_comp.get("recommendation", "")
        if rec:
            story.append(Paragraph(f"Recommendation: {rec}", body_style))

    # ── FOOTER ───────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=MID_GREY))
    story.append(Paragraph(
        f"Generated by PradnyaChakshu AI Bias Detection Platform · "
        f"{datetime.utcnow().strftime('%Y-%m-%d')} · Confidential",
        small_style,
    ))

    doc.build(story)
    return output_path
