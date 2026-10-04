"""
Generates data/movement_data.csv: realistic anonymized commuter movement
signals used to train the Isolation Forest behavioral anomaly model.
No GPS identity is stored - only derived kinematic/context features.
Deterministic (seeded) so the dataset is reproducible.
"""
import csv
import json
import os
import random

random.seed(42)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES_PATH = os.path.join(BASE, "data", "zones.json")
OUT_PATH = os.path.join(BASE, "data", "movement_data.csv")

with open(ZONES_PATH) as f:
    ZONES = json.load(f)

FOOTFALL_MAP = {"very_low": 0.15, "low": 0.35, "moderate": 0.55, "high": 0.85}

HEADER = [
    "record_id", "zone_id", "hour_of_day", "speed_kmph", "stop_duration_sec",
    "route_deviation_m", "isolation_score", "crowd_density", "dwell_events",
    "direction_changes", "is_anomaly"
]

rows = []
rid = 1
N_PER_ZONE = 300

for zone in ZONES:
    footfall_base = FOOTFALL_MAP[zone["footfall_night"]]
    for _ in range(N_PER_ZONE):
        hour = random.choices(
            population=list(range(24)),
            weights=[3 if (0 <= h <= 4 or 21 <= h <= 23) else
                     2 if (5 <= h <= 6 or 19 <= h <= 20) else 1
                     for h in range(24)],
            k=1
        )[0]
        night = 1 if (hour >= 21 or hour <= 5) else 0
        crowd_density = round(max(0.02, min(0.98,
            random.gauss(footfall_base * (0.4 if night else 1.0), 0.12))), 3)
        isolation_score = round(max(0.0, min(1.0,
            (1 - crowd_density) * random.uniform(0.7, 1.15))), 3)

        normal_speed = random.gauss(4.5, 1.1)
        normal_stop = max(0, random.gauss(15, 8))
        normal_dev = max(0, random.gauss(20, 12))
        normal_dwell = random.choices([0, 1], weights=[85, 15])[0]
        normal_dirchg = random.choices([0, 1, 2], weights=[70, 22, 8])[0]

        anomaly_prob = 0.06 + 0.20 * night + 0.18 * isolation_score
        is_anomaly = 1 if random.random() < min(anomaly_prob, 0.55) else 0

        if is_anomaly:
            speed = max(0, normal_speed + random.choice([-1, 1]) * random.uniform(2.5, 6.0))
            stop_duration = normal_stop + random.uniform(40, 180)
            route_dev = normal_dev + random.uniform(60, 250)
            dwell_events = random.choices([1, 2, 3], weights=[40, 40, 20])[0]
            dir_changes = random.choices([2, 3, 4, 5], weights=[30, 30, 25, 15])[0]
        else:
            speed = max(0.3, normal_speed)
            stop_duration = normal_stop
            route_dev = normal_dev
            dwell_events = normal_dwell
            dir_changes = normal_dirchg

        rows.append([
            f"REC{rid:05d}", zone["id"], hour, round(speed, 2),
            round(stop_duration, 1), round(route_dev, 1), isolation_score,
            crowd_density, dwell_events, dir_changes, is_anomaly
        ])
        rid += 1

random.shuffle(rows)

with open(OUT_PATH, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(HEADER)
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {OUT_PATH}")
