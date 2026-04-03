"""
SHAP Explainability Module
Computes feature importance and per-group SHAP attributions.
"""
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional


def compute_shap_summary(
    df: pd.DataFrame,
    label_col: str,
    protected_attrs: List[str],
    model_type: str = "classification",
    max_samples: int = 500,
) -> Dict[str, Any]:
    """
    Compute a SHAP-like feature importance summary using a proxy approach.
    For the MVP we use a trained LogisticRegression + LinearExplainer.
    Falls back to correlation-based importance if SHAP fails.
    """
    try:
        import shap
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import LabelEncoder, StandardScaler

        # Prepare features
        feature_cols = [c for c in df.columns if c != label_col]
        X = df[feature_cols].copy()
        y = df[label_col].values

        # Encode categoricals
        encoders = {}
        for col in X.columns:
            if X[col].dtype == object or X[col].dtype.name == "category":
                le = LabelEncoder()
                X[col] = le.fit_transform(X[col].astype(str))
                encoders[col] = le

        X = X.fillna(0)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Sample for speed
        if len(X_scaled) > max_samples:
            idx = np.random.choice(len(X_scaled), max_samples, replace=False)
            X_sample = X_scaled[idx]
            y_sample = y[idx]
        else:
            X_sample = X_scaled
            y_sample = y

        # Train a logistic regression
        model = LogisticRegression(max_iter=500, random_state=42)
        model.fit(X_sample, y_sample)

        # Compute SHAP values via LinearExplainer
        explainer = shap.LinearExplainer(model, X_sample)
        shap_values = explainer.shap_values(X_sample)

        if isinstance(shap_values, list):
            shap_values = shap_values[0]

        # Top features by mean absolute SHAP
        mean_abs = np.abs(shap_values).mean(axis=0)
        feature_names = feature_cols
        sorted_idx = np.argsort(mean_abs)[::-1]

        top_features = []
        for i in sorted_idx[:10]:
            top_features.append({
                "feature": feature_names[i],
                "importance": round(float(mean_abs[i]), 6),
                "direction": "positive" if float(np.mean(shap_values[:, i])) > 0 else "negative",
            })

        # Per-group SHAP (simplified: use avg importance for each group)
        by_group: Dict[str, List[Dict]] = {}
        for attr in protected_attrs:
            if attr not in df.columns:
                continue
            by_group[attr] = {}
            for group in df[attr].unique():
                mask = df[attr] == group
                group_df = df[mask][feature_cols].copy()
                for col in group_df.columns:
                    if group_df[col].dtype == object or group_df[col].dtype.name == "category":
                        group_df[col] = group_df[col].astype(str).map(
                            lambda x: encoders[col].transform([x])[0] if col in encoders and x in encoders[col].classes_ else 0
                        )
                group_df = group_df.fillna(0)
                group_scaled = scaler.transform(group_df)
                g_shap = explainer.shap_values(group_scaled)
                if isinstance(g_shap, list):
                    g_shap = g_shap[0]
                g_mean = np.abs(g_shap).mean(axis=0)
                by_group[attr][str(group)] = [
                    {"feature": feature_names[i], "importance": round(float(g_mean[i]), 6)}
                    for i in np.argsort(g_mean)[::-1][:5]
                ]

        # Beeswarm data (sample of SHAP points for top 5 features)
        beeswarm_data = []
        top5_idx = sorted_idx[:5]
        for i, row_shap in enumerate(shap_values[:100]):
            for feat_idx in top5_idx:
                beeswarm_data.append({
                    "feature": feature_names[feat_idx],
                    "shap_value": round(float(row_shap[feat_idx]), 6),
                    "feature_value": round(float(X_sample[i, feat_idx]), 4),
                })

        return {
            "top_features": top_features,
            "by_group": by_group,
            "beeswarm_data": beeswarm_data,
            "method": "shap_linear",
        }

    except Exception as e:
        # Fallback: correlation-based importance
        return _correlation_importance(df, label_col, protected_attrs, str(e))


def _correlation_importance(
    df: pd.DataFrame,
    label_col: str,
    protected_attrs: List[str],
    error_msg: str = "",
) -> Dict[str, Any]:
    """Fallback: compute feature importance via absolute correlation with label."""
    feature_cols = [c for c in df.columns if c != label_col]
    correlations = []

    for col in feature_cols:
        try:
            col_data = df[col].copy()
            if col_data.dtype == object or col_data.dtype.name == "category":
                col_data = pd.Categorical(col_data).codes
            corr = abs(float(col_data.corr(df[label_col].astype(float))))
            if not np.isnan(corr):
                correlations.append((col, corr))
        except Exception:
            continue

    correlations.sort(key=lambda x: x[1], reverse=True)
    top_features = [
        {"feature": col, "importance": round(imp, 6), "direction": "positive"}
        for col, imp in correlations[:10]
    ]

    return {
        "top_features": top_features,
        "by_group": {},
        "beeswarm_data": [],
        "method": "correlation_fallback",
        "_warning": f"SHAP failed ({error_msg}); using correlation importance",
    }
