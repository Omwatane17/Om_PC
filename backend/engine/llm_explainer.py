"""
Claude LLM Explainer
Generates plain-English bias explanations and remediation steps using Anthropic API.
"""
import json
import re
from typing import Dict, Any, List

SYSTEM_PROMPT = """
You are PradnyaChakshu, an expert AI fairness auditor with deep knowledge of:
- Statistical fairness metrics (demographic parity, equalized odds, SHAP)
- Anti-discrimination law (EU AI Act, US EEOC, CFPB fair lending)
- Machine learning bias causes (historical bias, measurement bias, aggregation bias, representation bias)
- Practical bias remediation techniques

You will receive structured audit results and must produce a JSON response with these exact keys:
  executive_summary     (2-3 sentences, plain English, no jargon)
  causal_hypotheses     (array of 3-5 objects: {hypothesis, evidence, confidence: 'HIGH'|'MEDIUM'|'LOW'})
  remediation_steps     (array of 4-6 objects: {action, priority, effort: 'LOW'|'MEDIUM'|'HIGH', expected_impact})
  regulation_compliance ({regulation_name, status: 'PASS'|'FAIL'|'PARTIAL', key_violations: string[], recommendation})

Rules:
- Never use technical metric names in executive_summary
- Cite specific numbers from the provided metrics
- remediation_steps must be actionable by a non-ML engineer
- Return ONLY valid JSON. No markdown, no preamble.
"""


def _format_top_violations(metrics: Dict[str, Any], top_n: int = 6) -> str:
    lines = []
    failed = [m for m in metrics.values() if m.get("pass_fail") == "FAIL"]
    failed.sort(key=lambda m: abs(m.get("overall_value", 0)), reverse=True)
    for m in failed[:top_n]:
        lines.append(
            f"- {m['metric_name']} [{m['protected_attr']}]: {m['overall_value']:.3f}"
            f" (threshold: {m['threshold']}) [{m['pass_fail']}]"
        )
        groups = m.get("by_group", {})
        if groups:
            for g, v in list(groups.items())[:4]:
                lines.append(f"    {g}: {v:.3f}")
    return "\n".join(lines) if lines else "No failing metrics."


def _format_shap(shap_summary: Dict[str, Any], top_n: int = 5) -> str:
    features = shap_summary.get("top_features", [])[:top_n]
    lines = [f"- {f['feature']}: importance={f['importance']:.4f} ({f.get('direction','')})"
             for f in features]
    return "\n".join(lines) if lines else "SHAP data unavailable."


def _format_worst_cf(counterfactuals: List[Dict[str, Any]]) -> str:
    worst = next((c for c in counterfactuals if c.get("decision_changed")), None)
    if not worst:
        return "No counterfactual reversals found."
    return (
        f"Changing {worst['attribute']} from '{worst['original_value']}' to "
        f"'{worst['counterfactual_value']}' changes the outcome "
        f"(score: {worst['original_score']:.2f} → {worst['counterfactual_score']:.2f})."
    )


def build_llm_prompt(
    audit_data: Dict[str, Any],
) -> str:
    return f"""
AUDIT CONTEXT:
Organisation context: {audit_data.get('org_context') or 'Not provided'}
Model type: {audit_data.get('model_type', 'classification')}
Regulation: {audit_data.get('regulation', 'generic')}
Dataset: {audit_data.get('row_count', 0)} rows, protected attributes: {', '.join(audit_data.get('protected_attrs', []))}
Overall risk score: {audit_data.get('risk_score', 0)}/100 ({audit_data.get('risk_level', 'UNKNOWN')})

FAIRNESS METRICS (top violations):
{_format_top_violations(audit_data.get('fairness_metrics', {}), top_n=6)}

TOP SHAP FEATURES DRIVING DISPARITY:
{_format_shap(audit_data.get('shap_summary', {}), top_n=5)}

WORST-CASE COUNTERFACTUAL:
{_format_worst_cf(audit_data.get('counterfactuals', []))}

Respond with the JSON structure specified in your system prompt.
"""


def call_llm_explainer(audit_data: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """Call Claude API to generate plain-English bias explanation."""
    if not api_key:
        return _fallback_explanation(audit_data)

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)
        prompt = build_llm_prompt(audit_data)
        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=2048,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text
        clean = re.sub(r"```json|```", "", raw).strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            return {
                "executive_summary": "Explanation generation failed; see raw metrics.",
                "causal_hypotheses": [],
                "remediation_steps": [],
                "regulation_compliance": {},
                "_error": "llm_parse_failure",
                "_raw": clean[:500],
            }
    except Exception as e:
        return _fallback_explanation(audit_data, error=str(e))


def _fallback_explanation(audit_data: Dict[str, Any], error: str = "") -> Dict[str, Any]:
    """Generate a rule-based fallback explanation when Claude is unavailable."""
    metrics = audit_data.get("fairness_metrics", {})
    risk_level = audit_data.get("risk_level", "UNKNOWN")
    risk_score = audit_data.get("risk_score", 0)

    failed = [m for m in metrics.values() if m.get("pass_fail") == "FAIL"]
    attrs = audit_data.get("protected_attrs", [])
    regulation = audit_data.get("regulation", "generic")

    executive_summary = (
        f"This AI system shows {'significant ' if risk_level in ('HIGH', 'CRITICAL') else ''}"
        f"fairness concerns with a risk score of {risk_score}/100 ({risk_level}). "
        f"{'Multiple' if len(failed) > 2 else str(len(failed))} fairness checks failed "
        f"across the protected attributes: {', '.join(attrs)}. "
        f"Immediate review is {'strongly ' if risk_level == 'CRITICAL' else ''}recommended."
    )

    causal_hypotheses = [
        {
            "hypothesis": "Historical training data reflects past discrimination",
            "evidence": f"{len(failed)} fairness metrics are failing, suggesting systemic patterns",
            "confidence": "HIGH" if risk_score > 60 else "MEDIUM",
        },
        {
            "hypothesis": "Proxy variables correlate with protected attributes",
            "evidence": "Features like ZIP code, education level, or job title may encode demographic information",
            "confidence": "MEDIUM",
        },
        {
            "hypothesis": "Under-representation in training data",
            "evidence": "Some demographic groups may have had fewer training examples, leading to lower model accuracy",
            "confidence": "MEDIUM" if len(attrs) > 1 else "LOW",
        },
    ]

    remediation_steps = [
        {
            "action": "Conduct a data audit to identify historically biased patterns in the training dataset",
            "priority": "HIGH",
            "effort": "MEDIUM",
            "expected_impact": "Identify root causes of bias before model retraining",
        },
        {
            "action": "Apply re-weighting or re-sampling techniques to balance demographic representation",
            "priority": "HIGH",
            "effort": "MEDIUM",
            "expected_impact": "Reduce demographic parity gap by 30-50%",
        },
        {
            "action": "Remove or transform proxy features that correlate with protected attributes",
            "priority": "MEDIUM",
            "effort": "LOW",
            "expected_impact": "Reduce indirect discrimination through correlated features",
        },
        {
            "action": f"Schedule quarterly bias audits using PradnyaChakshu to monitor {regulation} compliance",
            "priority": "MEDIUM",
            "effort": "LOW",
            "expected_impact": "Early detection of bias drift in production",
        },
    ]

    regulation_map = {
        "generic": "Fairness Standards",
        "eu_ai_act": "EU AI Act",
        "eeoc": "EEOC Uniform Guidelines",
        "cfpb": "CFPB Fair Lending",
    }

    regulation_compliance = {
        "regulation_name": regulation_map.get(regulation, regulation),
        "status": "FAIL" if len(failed) > 0 else "PASS",
        "key_violations": [m.get("metric_name", "") for m in failed[:3]],
        "recommendation": (
            "Remediate identified bias issues and re-audit before deployment. "
            f"All {len(failed)} failing metrics must pass before production use."
            if failed else "No violations found. Continue monitoring in production."
        ),
    }

    return {
        "executive_summary": executive_summary,
        "causal_hypotheses": causal_hypotheses,
        "remediation_steps": remediation_steps,
        "regulation_compliance": regulation_compliance,
        "_source": "rule_based_fallback",
        "_error": error,
    }
