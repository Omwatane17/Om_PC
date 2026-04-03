"""
Counterfactual Generator
Generates 'what-if' explanations by flipping protected attribute values.
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder, StandardScaler


def generate_counterfactuals(
    df: pd.DataFrame,
    label_col: str,
    protected_attrs: List[str],
    n_samples: int = 5,
) -> List[Dict[str, Any]]:
    """
    For each protected attribute, show what happens when we flip the value
    for a sample of individuals that received a negative outcome.
    """
    try:
        feature_cols = [c for c in df.columns if c != label_col]
        X = df[feature_cols].copy()
        y = df[label_col].values

        encoders: Dict[str, LabelEncoder] = {}
        for col in X.columns:
            if X[col].dtype == object or X[col].dtype.name == "category":
                le = LabelEncoder()
                X[col] = le.fit_transform(X[col].astype(str))
                encoders[col] = le

        X = X.fillna(0)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = LogisticRegression(max_iter=500, random_state=42)
        model.fit(X_scaled, y)

        # Find samples with negative outcome (label=0)
        neg_mask = y == 0
        neg_indices = np.where(neg_mask)[0]

        if len(neg_indices) == 0:
            return []

        sample_idx = neg_indices[:n_samples]
        results = []

        for idx in sample_idx:
            row = df.iloc[idx]
            row_features = X.iloc[idx].copy()
            original_scaled = scaler.transform([row_features.values])
            original_prob = float(model.predict_proba(original_scaled)[0][1])

            for attr in protected_attrs:
                if attr not in df.columns:
                    continue
                original_val = row[attr]
                unique_vals = df[attr].unique()

                for alt_val in unique_vals:
                    if alt_val == original_val:
                        continue
                    cf_features = row_features.copy()
                    if attr in encoders:
                        try:
                            cf_features[attr] = encoders[attr].transform([str(alt_val)])[0]
                        except ValueError:
                            continue
                    else:
                        cf_features[attr] = alt_val
                    cf_scaled = scaler.transform([cf_features.values])
                    cf_prob = float(model.predict_proba(cf_scaled)[0][1])
                    delta = cf_prob - original_prob
                    decision_changed = round(cf_prob) != round(original_prob)

                    results.append({
                        "row_index": int(idx),
                        "attribute": attr,
                        "original_value": str(original_val),
                        "counterfactual_value": str(alt_val),
                        "original_score": round(original_prob, 4),
                        "counterfactual_score": round(cf_prob, 4),
                        "score_delta": round(delta, 4),
                        "decision_changed": decision_changed,
                    })

        # Sort by absolute delta descending
        results.sort(key=lambda x: abs(x["score_delta"]), reverse=True)
        return results[:20]

    except Exception as e:
        return [{"error": str(e), "attribute": None, "decision_changed": False}]
