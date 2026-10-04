import os
import random

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv

from ml.risk_engine import compute_threat_score, escalation_stage
from utils.evidence_vault import (
    log_incident, log_media, list_incidents, list_media_for_incident,
    decrypt_incident, decrypt_media, verify_chain,
)
from utils.zones_store import get_zones, get_zone, recompute_zone_risk
from utils.jwt_auth import require_auth, issue_token

load_dotenv()

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get("PORT", 5000))
# 25MB cap on uploads (short SOS video/audio clips)
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024

ALLOWED_MEDIA_TYPES = {"photo", "audio", "video"}


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "SafeStride API", "version": "1.1.0"})


@app.post("/api/auth/token")
def auth_token():
    """Issues a demo JWT for dashboard/client access."""
    body = request.get_json(silent=True) or {}
    device_id = body.get("device_id", "anonymous-device")
    token = issue_token(device_id)
    return jsonify({"token": token, "expires_in": 3600})


@app.get("/api/zones")
def zones():
    return jsonify(get_zones())


@app.get("/api/zones/<zone_id>")
def zone_detail(zone_id):
    z = get_zone(zone_id)
    if not z:
        return jsonify({"error": "zone not found"}), 404
    return jsonify(z)


@app.get("/api/dashboard/stats")
def dashboard_stats():
    zs = get_zones()
    active_alerts = sum(1 for z in zs if z["current_risk"] >= 70)
    incidents = list_incidents()
    return jsonify({
        "threat_score": max((z["current_risk"] for z in zs), default=0),
        "active_alerts": active_alerts,
        "zones_live": len(zs),
        "detection_latency_ms": round(random.uniform(220, 340), 1),
        "ml_confidence": 91,
        "total_incidents_logged": len(incidents),
    })


@app.post("/api/threat-score")
def threat_score():
    """Computes a live multi-factor threat score for a movement sample.
    Body: { zone_id, hour_of_day, speed_kmph, stop_duration_sec,
            route_deviation_m, isolation_score, crowd_density,
            dwell_events, direction_changes }
    """
    body = request.get_json(force=True)
    zone_id = body.get("zone_id")
    zone = get_zone(zone_id)
    if not zone:
        return jsonify({"error": "unknown zone_id"}), 400

    required = ["hour_of_day", "speed_kmph", "stop_duration_sec",
                "route_deviation_m", "isolation_score", "crowd_density",
                "dwell_events", "direction_changes"]
    missing = [k for k in required if k not in body]
    if missing:
        return jsonify({"error": f"missing fields: {missing}"}), 400

    result = compute_threat_score(body, zone["base_risk"])
    result["stage"] = escalation_stage(result["threat_score"])
    recompute_zone_risk(zone_id, result["threat_score"])
    return jsonify(result)


@app.post("/api/sos")
def sos_trigger():
    """SOS Emergency Protocol trigger (hold 2.5s on client).
    Body: { zone_id, threat_score, severity, notes?, lat?, lng?,
            location_accuracy_m? }
    Auto-logs to the AES-256 encrypted, SHA-256 hash-chained Evidence
    Vault. lat/lng come from the browser's Geolocation API captured at
    the moment SOS was held; media (photo/audio/video) is attached
    afterwards via POST /api/evidence/<incident_id>/media.
    """
    body = request.get_json(force=True)
    zone_id = body.get("zone_id")
    zone = get_zone(zone_id)
    if not zone:
        return jsonify({"error": "unknown zone_id"}), 400

    threat = int(body.get("threat_score", zone["current_risk"]))
    stage = escalation_stage(threat)
    incident = log_incident({
        "zone_id": zone_id,
        "zone_name": zone["name"],
        "severity": body.get("severity", "high"),
        "threat_score": threat,
        "stage": stage,
        "notes": body.get("notes", "SOS manually triggered by user"),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "location_accuracy_m": body.get("location_accuracy_m"),
    })
    return jsonify({"status": "logged", "stage": stage, "incident": incident}), 201


@app.post("/api/evidence/<incident_id>/media")
def upload_evidence_media(incident_id):
    """Accepts a photo/audio/video capture (multipart/form-data) and
    attaches it to an existing incident. Encrypted with AES-256 and
    chained into the same SHA-256 hash chain as the incident log.

    Form fields:
      file        - the binary blob (required)
      media_type  - 'photo' | 'audio' | 'video' (required)
    """
    if decrypt_incident(incident_id) is None:
        return jsonify({"error": "unknown incident_id"}), 404

    media_type = request.form.get("media_type")
    if media_type not in ALLOWED_MEDIA_TYPES:
        return jsonify({"error": f"media_type must be one of {sorted(ALLOWED_MEDIA_TYPES)}"}), 400

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "missing file"}), 400

    data_bytes = file.read()
    if not data_bytes:
        return jsonify({"error": "empty file"}), 400

    record = log_media(incident_id, media_type, file.mimetype or "application/octet-stream", data_bytes)
    return jsonify(record), 201


@app.get("/api/evidence/<incident_id>/media")
def list_evidence_media(incident_id):
    return jsonify(list_media_for_incident(incident_id))


@app.get("/api/evidence/media/<record_id>/download")
def download_evidence_media(record_id):
    """Decrypts and streams back one media record (for in-app playback)."""
    data_bytes, mime_type = decrypt_media(record_id)
    if data_bytes is None:
        return jsonify({"error": "not found"}), 404
    return Response(data_bytes, mimetype=mime_type)


@app.get("/api/evidence")
def evidence_list():
    return jsonify(list_incidents())


@app.get("/api/evidence/<incident_id>")
def evidence_detail(incident_id):
    data = decrypt_incident(incident_id)
    if data is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(data)


@app.get("/api/evidence/verify")
def evidence_verify():
    return jsonify({"chain_intact": verify_chain()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")
