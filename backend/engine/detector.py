"""
Sensitive Attribute Detector — PradnyaChakshu
Three-stage pipeline:
  Stage 1: Column name keyword heuristics
  Stage 2: Value distribution analysis  
  Stage 3: Embedding similarity (sentence-transformers) — catches obfuscated names
"""
import logging
import re
from typing import List, Dict, Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("pradnyachakshu.detector")

# ── Stage 1: Keyword heuristics ───────────────────────────────────────────────
PROTECTED_KEYWORDS = {
    "gender", "sex", "race", "ethnicity", "ethnic", "age", "dob",
    "birth", "zip", "zipcode", "postcode", "postal", "nationality",
    "religion", "disability", "marital", "pregnancy", "veteran",
    "colour", "color", "origin", "caste", "tribe", "class",
    "income_bracket", "census", "demographic", "segment",
}

# ── Stage 2: Known protected value sets ───────────────────────────────────────
GENDER_VALUES = {"male", "female", "m", "f", "man", "woman", "non-binary", "other"}
RACE_VALUES   = {"white", "black", "hispanic", "asian", "native", "pacific", "mixed", "other"}

# ── Stage 3: Embedding seed phrases for protected attributes ──────────────────
# These are representative phrases that protected-attribute columns "sound like".
EMBEDDING_SEED_PHRASES = [
    "gender identity of the person",
    "racial or ethnic background",
    "age of the applicant",
    "zip code or postal code",
    "national origin or country of birth",
    "religious affiliation",
    "marital status",
    "disability status",
    "pregnancy or maternity status",
    "veteran military status",
    "demographic group membership",
    "protected class category",
    "socioeconomic segment code",
]
EMBEDDING_SIMILARITY_THRESHOLD = 0.48   # cosine similarity cutoff (lower = more recall)

# Global cache — model loaded once per process
_embedding_model = None
_seed_embeddings: Optional[np.ndarray] = None


def _load_embedding_model():
    """Lazy-load sentence-transformers model. Returns None if unavailable."""
    global _embedding_model, _seed_embeddings
    if _embedding_model is not None:
        return _embedding_model
    try:
        from sentence_transformers import SentenceTransformer   # noqa: F401
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        _seed_embeddings = _embedding_model.encode(
            EMBEDDING_SEED_PHRASES, normalize_embeddings=True, show_progress_bar=False
        )
        logger.info("Embedding model loaded: all-MiniLM-L6-v2")
        return _embedding_model
    except Exception as e:
        logger.warning(f"Stage 3 embedding unavailable (sentence-transformers not installed): {e}")
        return None


def _cosine_max_similarity(col_name: str, model, seed_embeddings: np.ndarray) -> float:
    """Return the maximum cosine similarity between the column name and seed phrases."""
    # Expand column name into a natural phrase for better matching
    phrase = col_name.lower().replace("_", " ").replace("-", " ")
    query = f"column called {phrase}"
    embedding = model.encode([query], normalize_embeddings=True, show_progress_bar=False)
    sims = seed_embeddings @ embedding.T          # shape: (n_seeds,)
    return float(np.max(sims))


# ── Public API ─────────────────────────────────────────────────────────────────

def detect_sensitive_attributes(df: pd.DataFrame) -> List[str]:
    """
    Returns a list of column names likely to be sensitive/protected attributes.
    Three-stage pipeline with graceful downgrades.
    """
    detected: List[str] = []
    stage3_candidates: List[str] = []

    # Pre-load embedding model (non-blocking; skipped if unavailable)
    model = _load_embedding_model()

    for col in df.columns:
        col_lower = col.lower().replace("_", " ").replace("-", " ")

        # ── Stage 1: Column name keyword match ───────────────────────────────
        if any(kw in col_lower for kw in PROTECTED_KEYWORDS):
            detected.append(col)
            continue

        # ── Stage 2: Value distribution analysis ─────────────────────────────
        if _is_low_cardinality_categorical(df[col]):
            if _has_protected_values(df[col]):
                detected.append(col)
                continue
            # Low-cardinality but unknown values → candidate for Stage 3
            stage3_candidates.append(col)

    # ── Stage 3: Embedding similarity on remaining candidates ────────────────
    if model is not None and _seed_embeddings is not None and stage3_candidates:
        for col in stage3_candidates:
            try:
                sim = _cosine_max_similarity(col, model, _seed_embeddings)
                if sim >= EMBEDDING_SIMILARITY_THRESHOLD:
                    logger.info(f"Stage 3 detected '{col}' as sensitive (similarity={sim:.3f})")
                    detected.append(col)
            except Exception as e:
                logger.debug(f"Stage 3 skip '{col}': {e}")

    return list(dict.fromkeys(detected))   # deduplicate, preserve order


def _is_low_cardinality_categorical(series: pd.Series) -> bool:
    """Column with 2–30 unique values, not purely high-digit numeric."""
    n_unique = series.nunique()
    if n_unique < 2 or n_unique > 30:
        return False
    if pd.api.types.is_numeric_dtype(series):
        return n_unique <= 10
    return True


def _has_protected_values(series: pd.Series) -> bool:
    """Column values match known protected attribute value sets."""
    values = {str(v).lower().strip() for v in series.dropna().unique()}
    return bool(values & GENDER_VALUES) or bool(values & RACE_VALUES)


def profile_dataframe(df: pd.DataFrame, detected_attrs: List[str], label_col: str) -> Dict[str, Any]:
    """Return a dataset profile summary."""
    profile: Dict[str, Any] = {
        "row_count": len(df),
        "column_count": len(df.columns),
        "label_column": label_col,
        "protected_attrs": detected_attrs,
        "class_balance": {},
        "demographic_distributions": {},
        "missing_pct": {},
    }

    if label_col in df.columns:
        vc = df[label_col].value_counts(normalize=True)
        profile["class_balance"] = {str(k): round(float(v), 4) for k, v in vc.items()}

    for attr in detected_attrs:
        if attr in df.columns:
            vc = df[attr].value_counts(normalize=True)
            profile["demographic_distributions"][attr] = {
                str(k): round(float(v), 4) for k, v in vc.items()
            }

    for col in df.columns:
        pct = round(float(df[col].isnull().mean()) * 100, 2)
        if pct > 0:
            profile["missing_pct"][col] = pct

    return profile
