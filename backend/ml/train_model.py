"""Trains the unsupervised Isolation Forest behavioral anomaly model
on data/movement_data.csv and saves it to ml/model.pkl."""
import os
import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE, "data", "movement_data.csv")
MODEL_PATH = os.path.join(BASE, "ml", "model.pkl")

FEATURES = [
    "speed_kmph", "stop_duration_sec", "route_deviation_m",
    "isolation_score", "crowd_density", "dwell_events", "direction_changes"
]

def train():
    df = pd.read_csv(DATA_PATH)
    X = df[FEATURES]
    model = IsolationForest(
        n_estimators=200,
        contamination=0.18,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X)
    joblib.dump({"model": model, "features": FEATURES}, MODEL_PATH)

    preds = model.predict(X)
    detected = (preds == -1).sum()
    print(f"Model trained on {len(df)} records. Flagged {detected} anomalies.")
    print(f"Saved -> {MODEL_PATH}")

if __name__ == "__main__":
    train()
