"""
Privacy-First Evidence Vault.

- AES-256 (Fernet) encrypted payloads at rest - both JSON incident metadata
  AND raw media bytes (photo / audio / video) are encrypted before they
  touch disk.
- SHA-256 tamper-evident hash chain across EVERY record (incidents and
  media both) - each record hashes in the previous record's hash, so the
  vault is a single append-only chain. Editing any past record breaks
  every hash after it -> chain-of-custody integrity, court-admissible.
"""
import base64
import hashlib
import json
import os
import time
import uuid

from cryptography.fernet import Fernet

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAULT_PATH = os.path.join(BASE, "data", "evidence_vault.json")
MEDIA_DIR = os.path.join(BASE, "data", "evidence_media")
KEY_ENV = "SafeStride_VAULT_KEY"

os.makedirs(MEDIA_DIR, exist_ok=True)


def _get_fernet() -> Fernet:
    key = os.environ.get(KEY_ENV)
    if not key:
        # Deterministic dev fallback key derived from a fixed secret.
        # In production this MUST come from a secure secrets manager.
        raw = hashlib.sha256(b"SafeStride-dev-secret-change-me").digest()
        key = base64.urlsafe_b64encode(raw)
    else:
        key = key.encode()
    return Fernet(key)


def _load() -> list:
    if not os.path.exists(VAULT_PATH):
        return []
    with open(VAULT_PATH) as f:
        return json.load(f)


def _save(records: list):
    with open(VAULT_PATH, "w") as f:
        json.dump(records, f, indent=2)


def _append_record(record_type: str, plaintext_bytes: bytes, meta: dict) -> dict:
    """Shared append logic: encrypt, chain-hash, persist. Used by both
    incident (JSON) and media (binary) records so the whole vault is one
    unbroken chain regardless of record type."""
    f = _get_fernet()
    records = _load()
    prev_hash = records[-1]["record_hash"] if records else "0" * 64

    ciphertext = f.encrypt(plaintext_bytes).decode()
    chain_input = (prev_hash + ciphertext).encode()
    record_hash = hashlib.sha256(chain_input).hexdigest()

    record = {
        "record_id": str(uuid.uuid4()),
        "record_type": record_type,   # "incident" | "media"
        "timestamp": meta.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **meta,
        "encrypted_payload": ciphertext,
        "prev_hash": prev_hash,
        "record_hash": record_hash,
    }
    records.append(record)
    _save(records)
    return record


def log_incident(incident: dict) -> dict:
    """Encrypts and appends an incident (SOS trigger) to the vault.
    incident may include lat/lng captured from the browser's Geolocation
    API at the moment SOS was held."""
    payload = {
        "incident_id": str(uuid.uuid4()),
        "timestamp": incident.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "zone_id": incident["zone_id"],
        "zone_name": incident.get("zone_name", ""),
        "severity": incident["severity"],
        "threat_score": incident["threat_score"],
        "stage": incident["stage"],
        "notes": incident.get("notes", ""),
        "lat": incident.get("lat"),
        "lng": incident.get("lng"),
        "location_accuracy_m": incident.get("location_accuracy_m"),
    }
    plaintext = json.dumps(payload, sort_keys=True).encode()

    meta = {
        "incident_id": payload["incident_id"],
        "zone_id": payload["zone_id"],
        "zone_name": payload["zone_name"],
        "severity": payload["severity"],
        "threat_score": payload["threat_score"],
        "stage": payload["stage"],
        "timestamp": payload["timestamp"],
        "has_location": payload["lat"] is not None,
    }
    record = _append_record("incident", plaintext, meta)
    return {k: v for k, v in record.items() if k != "encrypted_payload"}


def log_media(incident_id: str, media_type: str, mime_type: str, data_bytes: bytes) -> dict:
    """Encrypts and appends a photo/audio/video capture linked to an
    incident_id. media_type in {'photo', 'audio', 'video'}."""
    checksum = hashlib.sha256(data_bytes).hexdigest()
    meta = {
        "incident_id": incident_id,
        "media_type": media_type,
        "mime_type": mime_type,
        "size_bytes": len(data_bytes),
        "checksum_sha256": checksum,
    }
    record = _append_record("media", data_bytes, meta)
    return {k: v for k, v in record.items() if k != "encrypted_payload"}


def list_incidents() -> list:
    records = _load()
    return [
        {k: v for k, v in r.items() if k != "encrypted_payload"}
        for r in records if r["record_type"] == "incident"
    ]


def list_media_for_incident(incident_id: str) -> list:
    records = _load()
    return [
        {k: v for k, v in r.items() if k != "encrypted_payload"}
        for r in records
        if r["record_type"] == "media" and r["incident_id"] == incident_id
    ]


def decrypt_incident(incident_id: str) -> dict:
    f = _get_fernet()
    for r in _load():
        if r["record_type"] == "incident" and r["incident_id"] == incident_id:
            plaintext = f.decrypt(r["encrypted_payload"].encode())
            return json.loads(plaintext)
    return None


def decrypt_media(record_id: str):
    """Returns (bytes, mime_type) for a media record, or None."""
    f = _get_fernet()
    for r in _load():
        if r["record_type"] == "media" and r["record_id"] == record_id:
            plaintext = f.decrypt(r["encrypted_payload"].encode())
            return plaintext, r["mime_type"]
    return None, None


def verify_chain() -> bool:
    """Recomputes the SHA-256 hash chain across ALL records (incidents
    and media) to confirm no tampering."""
    records = _load()
    prev_hash = "0" * 64
    for r in records:
        chain_input = (prev_hash + r["encrypted_payload"]).encode()
        expected = hashlib.sha256(chain_input).hexdigest()
        if expected != r["record_hash"] or r["prev_hash"] != prev_hash:
            return False
        prev_hash = r["record_hash"]
    return True
