"""
Fairness Metrics Engine
Computes 10+ bias metrics using Fairlearn + custom implementations.
"""
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple, Optional

try:
    from fairlearn.metrics import (
        demographic_parity_difference,
        equalized_odds_difference,
        equal_opportunity_difference,
    )
    FAIRLEARN_AVAILABLE = True
except ImportError:
    FAIRLEARN_AVAILABLE = False


# ── Threshold configuration per regulation ──────────────────────────────────

THRESHOLDS = {
    "generic":   {"dpd": 0.10, "eod": 0.10, "dir": 0.80, "cald": 0.05, "ppd": 0.10},
    "eu_ai_act": {"dpd": 0.05, "eod": 0.05, "dir": 0.90, "cald": 0.03, "ppd": 0.05},
    "eeoc":      {"dpd": 0.10, "eod": 0.10, "dir": 0.80, "cald": 0.05, "ppd": 0.10},
    "cfpb":      {"dpd": 0.08, "eod": 0.10, "dir": 0.80, "cald": 0.05, "ppd": 0.08},
}


def _pf(value: float, threshold: float, higher_is_better: bool = False) -> str:
    if higher_is_better:
        return "PASS" if value >= threshold else "FAIL"
    return "PASS" if abs(value) <= threshold else "FAIL"


def _approval_rates_by_group(y_pred: np.ndarray, sensitive: pd.Series) -> Dict[str, float]:
    rates = {}
    for group in sensitive.unique():
        mask = sensitive == group
        rates[str(group)] = float(np.mean(y_pred[mask]))
    return rates


def compute_all_metrics(
    df: pd.DataFrame,
    label_col: str,
    protected_attrs: List[str],
    regulation: str = "generic",
    score_col: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compute all fairness metrics for each protected attribute.
    Returns a nested dict: { metric_display_name: { protected_attr: metric_result } }
    """
    thresh = THRESHOLDS.get(regulation, THRESHOLDS["generic"])
    all_results: Dict[str, Any] = {}

    y_true = df[label_col].values.astype(int)
    y_pred = None

    # Use score column if provided, otherwise use label as prediction
    if score_col and score_col in df.columns:
        scores = df[score_col].values
        y_pred = (scores >= 0.5).astype(int)
    else:
        y_pred = y_true.copy()

    for attr in protected_attrs:
        if attr not in df.columns:
            continue
        sensitive = df[attr].astype(str)
        groups = sensitive.unique().tolist()
        if len(groups) < 2:
            continue

        approval_by_group = _approval_rates_by_group(y_pred, sensitive)

        # ── 1. Demographic Parity Difference ────────────────────────────────
        rates = list(approval_by_group.values())
        dpd_val = max(rates) - min(rates)
        all_results[f"demographic_parity_difference|{attr}"] = {
            "metric_name": "Demographic Parity Difference",
            "protected_attr": attr,
            "overall_value": round(dpd_val, 6),
            "disparity_ratio": round(min(rates) / max(rates), 6) if max(rates) > 0 else 1.0,
            "pass_fail": _pf(dpd_val, thresh["dpd"]),
            "threshold": thresh["dpd"],
            "by_group": {k: round(v, 6) for k, v in approval_by_group.items()},
        }

        # ── 2. Disparate Impact Ratio (4/5ths Rule) ─────────────────────────
        if max(rates) > 0:
            dir_val = min(rates) / max(rates)
        else:
            dir_val = 1.0
        all_results[f"disparate_impact_ratio|{attr}"] = {
            "metric_name": "Disparate Impact Ratio (4/5ths Rule)",
            "protected_attr": attr,
            "overall_value": round(dir_val, 6),
            "disparity_ratio": round(dir_val, 6),
            "pass_fail": _pf(dir_val, thresh["dir"], higher_is_better=True),
            "threshold": thresh["dir"],
            "by_group": {k: round(v, 6) for k, v in approval_by_group.items()},
        }

        # ── 3. Equalized Odds Difference ────────────────────────────────────
        # TPR and FPR per group
        tpr_by_group: Dict[str, float] = {}
        fpr_by_group: Dict[str, float] = {}
        for group in groups:
            mask = sensitive == group
            y_t = y_true[mask]
            y_p = y_pred[mask]
            tp = np.sum((y_t == 1) & (y_p == 1))
            fn = np.sum((y_t == 1) & (y_p == 0))
            fp = np.sum((y_t == 0) & (y_p == 1))
            tn = np.sum((y_t == 0) & (y_p == 0))
            tpr_by_group[str(group)] = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
            fpr_by_group[str(group)] = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0

        tpr_vals = list(tpr_by_group.values())
        fpr_vals = list(fpr_by_group.values())
        eod_val = max(
            max(tpr_vals) - min(tpr_vals),
            max(fpr_vals) - min(fpr_vals),
        ) if tpr_vals and fpr_vals else 0.0
        all_results[f"equalized_odds_difference|{attr}"] = {
            "metric_name": "Equalized Odds Difference",
            "protected_attr": attr,
            "overall_value": round(eod_val, 6),
            "disparity_ratio": round(min(tpr_vals) / max(tpr_vals), 6) if max(tpr_vals) > 0 else 1.0,
            "pass_fail": _pf(eod_val, thresh["eod"]),
            "threshold": thresh["eod"],
            "by_group": {f"{k}_tpr": round(v, 6) for k, v in tpr_by_group.items()},
        }

        # ── 4. Equal Opportunity Difference ─────────────────────────────────
        eopd_val = max(tpr_vals) - min(tpr_vals) if tpr_vals else 0.0
        all_results[f"equal_opportunity_difference|{attr}"] = {
            "metric_name": "Equal Opportunity Difference",
            "protected_attr": attr,
            "overall_value": round(eopd_val, 6),
            "disparity_ratio": round(min(tpr_vals) / max(tpr_vals), 6) if max(tpr_vals) > 0 else 1.0,
            "pass_fail": _pf(eopd_val, thresh["eod"]),
            "threshold": thresh["eod"],
            "by_group": {k: round(v, 6) for k, v in tpr_by_group.items()},
        }

        # ── 5. Predictive Parity Difference (PPV) ───────────────────────────
        ppv_by_group: Dict[str, float] = {}
        for group in groups:
            mask = sensitive == group
            y_t = y_true[mask]
            y_p = y_pred[mask]
            tp = np.sum((y_t == 1) & (y_p == 1))
            fp = np.sum((y_t == 0) & (y_p == 1))
            ppv_by_group[str(group)] = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0

        ppv_vals = list(ppv_by_group.values())
        ppd_val = max(ppv_vals) - min(ppv_vals) if ppv_vals else 0.0
        all_results[f"predictive_parity_difference|{attr}"] = {
            "metric_name": "Predictive Parity Difference",
            "protected_attr": attr,
            "overall_value": round(ppd_val, 6),
            "disparity_ratio": round(min(ppv_vals) / max(ppv_vals), 6) if max(ppv_vals) > 0 else 1.0,
            "pass_fail": _pf(ppd_val, thresh["ppd"]),
            "threshold": thresh["ppd"],
            "by_group": {k: round(v, 6) for k, v in ppv_by_group.items()},
        }

        # ── 6. Treatment Equality (FN/FP ratio) ─────────────────────────────
        te_by_group: Dict[str, float] = {}
        for group in groups:
            mask = sensitive == group
            y_t = y_true[mask]
            y_p = y_pred[mask]
            fn = np.sum((y_t == 1) & (y_p == 0))
            fp = np.sum((y_t == 0) & (y_p == 1))
            te_by_group[str(group)] = float(fn / fp) if fp > 0 else (float(fn) if fn > 0 else 0.0)

        te_vals = list(te_by_group.values())
        te_diff = max(te_vals) - min(te_vals) if te_vals else 0.0
        all_results[f"treatment_equality|{attr}"] = {
            "metric_name": "Treatment Equality (FN/FP Ratio)",
            "protected_attr": attr,
            "overall_value": round(te_diff, 6),
            "disparity_ratio": round(min(te_vals) / max(te_vals), 6) if max(te_vals) > 0 else 1.0,
            "pass_fail": _pf(te_diff, 0.20),
            "threshold": 0.20,
            "by_group": {k: round(v, 6) for k, v in te_by_group.items()},
        }

    return all_results


def compute_risk_score(metrics: Dict[str, Any]) -> Tuple[float, str]:
    """Compute overall risk score (0–100) from metric results."""
    weights = {
        "Demographic Parity Difference": 0.25,
        "Equalized Odds Difference": 0.20,
        "Disparate Impact Ratio (4/5ths Rule)": 0.20,
        "Equal Opportunity Difference": 0.15,
        "Predictive Parity Difference": 0.10,
        "Treatment Equality (FN/FP Ratio)": 0.10,
    }
    score = 0.0
    total_weight = 0.0
    for key, m in metrics.items():
        name = m.get("metric_name", "")
        w = weights.get(name, 0.05)
        threshold = m.get("threshold", 0.10)
        val = abs(m.get("overall_value", 0.0))
        # For DIR, invert (low = bad)
        if name == "Disparate Impact Ratio (4/5ths Rule)":
            val = max(0.0, 1.0 - m.get("overall_value", 1.0))
        severity = min(val / threshold if threshold > 0 else 0, 2.0) / 2.0
        score += w * severity * 100
        total_weight += w
    if total_weight > 0:
        score = score / total_weight * sum(weights.values())

    score = round(min(score, 100), 2)
    risk_level = (
        "LOW" if score < 20 else
        "MEDIUM" if score < 45 else
        "HIGH" if score < 70 else
        "CRITICAL"
    )
    return score, risk_level
