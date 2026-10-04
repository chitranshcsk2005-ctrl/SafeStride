"""In-memory dynamic micro-zone risk state, seeded from data/zones.json.
Simulates the 'Dynamic Micro-Zone Risk Engine' which continuously
recalculates area risk as new threat scores come in."""
import json
import os
import threading

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES_PATH = os.path.join(BASE, "data", "zones.json")

_lock = threading.Lock()

with open(ZONES_PATH) as f:
    _raw_zones = json.load(f)

_state = {z["id"]: {**z, "current_risk": z["base_risk"]} for z in _raw_zones}


def get_zones():
    with _lock:
        return list(_state.values())


def get_zone(zone_id):
    with _lock:
        return _state.get(zone_id)


def recompute_zone_risk(zone_id: str, new_score: int, alpha: float = 0.35):
    """Exponentially-weighted update so a single sample doesn't whipsaw
    the zone's displayed risk."""
    with _lock:
        if zone_id not in _state:
            return None
        prev = _state[zone_id]["current_risk"]
        blended = round(prev * (1 - alpha) + new_score * alpha)
        _state[zone_id]["current_risk"] = max(0, min(100, blended))
        return _state[zone_id]
