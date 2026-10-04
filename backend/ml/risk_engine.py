"""
Multi-Factor Threat Probability Score engine.
Weights (per SafeStride spec):
  behavioral deviation 25%, isolation index 30%, temporal risk 20%,
  crowd signal 15%, route deviation 10%.
"""
import os
import joblib
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE, "model.pkl")

_bundle = joblib.load(MODEL_PATH)
_model = _bundle["model"]
_features = _bundle["features"]

WEIGHTS = {
    "behavioral": 0.25,
    "isolation": 0.30,
    "temporal": 0.20,
    "crowd": 0.15,
    "route": 0.10,
}


def _temporal_risk(hour: int) -> float:
    if hour >= 23 or hour <= 4:
        return 0.95
    if hour in (5, 6, 21, 22):
        return 0.65
    if hour in (7, 8, 18, 19, 20):
        return 0.35
    return 0.15


def behavioral_anomaly_score(sample: dict) -> float:
    """Runs Isolation Forest; converts decision_function to a 0-1 score
    where 1 = highly anomalous."""
    X = pd.DataFrame([[sample[f] for f in _features]], columns=_features)
    raw = _model.decision_function(X)[0]  # higher = more normal
    is_outlier = _model.predict(X)[0] == -1
    score = float(np.clip(0.5 - raw, 0, 1))
    if is_outlier:
        score = max(score, 0.65)
    return round(score, 3)


def compute_threat_score(sample: dict, zone_base_risk: int) -> dict:
    behavioral = behavioral_anomaly_score(sample)
    isolation = float(sample["isolation_score"])
    temporal = _temporal_risk(int(sample["hour_of_day"]))
    crowd = 1 - float(sample["crowd_density"])
    route = float(np.clip(sample["route_deviation_m"] / 250.0, 0, 1))

    factors = {
        "behavioral_anomaly": round(behavioral * 100, 1),
        "isolation_index": round(isolation * 100, 1),
        "temporal_risk": round(temporal * 100, 1),
        "crowd_signal": round(crowd * 100, 1),
        "route_deviation": round(route * 100, 1),
    }

    weighted = (
        behavioral * WEIGHTS["behavioral"] +
        isolation * WEIGHTS["isolation"] +
        temporal * WEIGHTS["temporal"] +
        crowd * WEIGHTS["crowd"] +
        route * WEIGHTS["route"]
    )
    # Blend in the zone's static base risk (30% weight) for context.
    final = weighted * 0.7 + (zone_base_risk / 100.0) * 0.3
    score_0_100 = round(final * 100)

    if score_0_100 >= 80:
        level = "CRITICAL RISK"
    elif score_0_100 >= 60:
        level = "HIGH RISK"
    elif score_0_100 >= 35:
        level = "MODERATE RISK"
    else:
        level = "LOW RISK"

    return {
        "threat_score": score_0_100,
        "risk_level": level,
        "factors": factors,
        "is_anomaly": behavioral >= 0.65,
    }


def escalation_stage(score: int) -> str:
    if score >= 85:
        return "EMERGENCY_DISPATCH"
    if score >= 65:
        return "LOCATION_SHARE"
    if score >= 40:
        return "VIBRATE_ALERT"
    return "SILENT_MONITOR"
