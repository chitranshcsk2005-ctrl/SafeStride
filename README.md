# SafeStride — Predictive Urban Safety Intelligence

AI-driven, proactive safety platform using real-time multi-factor risk
intelligence to prevent urban threats — protecting daily commuters across
Indian metro cities.

**Team:** HACK THRUST · **Event:** Code1 · **Domain:** SafeStride

## Features

- 🤖 **Behavioral Anomaly Detection** — Unsupervised Isolation Forest (Scikit-learn) flags abnormal movement patterns without GPS identity tracking.
- 📍 **Dynamic Micro-Zone Risk Engine** — 7 live-monitored zones across Greater Noida, risk recalculated on every submitted sample.
- 🔢 **Multi-Factor Threat Probability Score** — Live 0–100 index: behavioral (25%), isolation (30%), temporal (20%), crowd (15%), route deviation (10%).
- ⚡ **Smart Escalation Engine** — 4-stage proportionate response: Silent Monitor → Vibrate Alert → Location Share → Emergency Dispatch.
- 🔐 **Privacy-First Evidence Vault** — AES-256 encrypted incident **and media** storage with a SHA-256 tamper-evident hash chain (court-admissible format).
- 📸 **Automatic Evidence Capture on SOS** — holding SOS captures live GPS location, a photo, and a short audio/video clip (with browser permission) and encrypts + uploads them to the vault automatically.
- 🗺 **Micro-Zone Risk Map** — Leaflet.js + OpenStreetMap live geospatial view.

## Project Structure

```
SafeStride/
├── backend/
│   ├── app.py                  # Flask API entrypoint
│   ├── requirements.txt
│   ├── .env.example
│   ├── ml/
│   │   ├── generate_dataset.py # builds data/movement_data.csv
│   │   ├── train_model.py      # trains Isolation Forest -> model.pkl
│   │   ├── risk_engine.py      # multi-factor threat score engine
│   │   └── model.pkl           # pre-trained model (included)
│   ├── utils/
│   │   ├── zones_store.py      # dynamic micro-zone risk state
│   │   ├── evidence_vault.py   # AES-256 + SHA-256 hash-chain vault (incidents + media)
│   │   └── jwt_auth.py
│   └── data/
│       ├── zones.json          # 7 Greater Noida micro-zones
│       ├── movement_data.csv   # 2,100-row training dataset (included)
│       ├── evidence_vault.json # incident + media log (starts empty)
│       └── evidence_media/     # (unused - media is stored encrypted inline in evidence_vault.json)
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── .env.example
    └── src/
        ├── App.jsx
        ├── api.js
        ├── components/
        │   ├── Dashboard.jsx
        │   ├── RiskMap.jsx
        │   ├── SOSPanel.jsx        # hold-to-trigger + location/photo/video capture
        │   └── EvidenceVault.jsx   # incident + attached media viewer
        ├── utils/
        │   └── mediaCapture.js     # geolocation + camera/mic + MediaRecorder helpers
        └── styles/global.css
```

## Prerequisites

- Python 3.10+
- Node.js 18+ and npm

## 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in JWT_SECRET / SafeStride_VAULT_KEY (see below)
```

Generate real secrets before production use:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output into `SafeStride_VAULT_KEY` in `.env`. A dev fallback key is
used automatically if you skip this step (fine for local testing only).

The dataset and trained model are already included. To regenerate them:

```bash
python ml/generate_dataset.py
python ml/train_model.py
```

Run the API:

```bash
python app.py
# -> http://localhost:5000
```

## 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env    # defaults to http://localhost:5000/api
npm run dev
# -> http://localhost:5173
```

## API Reference

| Method | Endpoint                | Description                                   |
|--------|--------------------------|------------------------------------------------|
| GET    | `/api/health`             | Service health check                          |
| GET    | `/api/zones`               | List all micro-zones with live risk           |
| GET    | `/api/zones/<id>`          | Single zone detail                            |
| GET    | `/api/dashboard/stats`     | Aggregated dashboard metrics                  |
| POST   | `/api/threat-score`        | Compute multi-factor threat score for a sample|
| POST   | `/api/sos`                  | Trigger SOS (with optional lat/lng), auto-logs to Evidence Vault |
| POST   | `/api/evidence/<incident_id>/media` | Upload a photo/audio/video capture, encrypted + hash-chained |
| GET    | `/api/evidence/<incident_id>/media` | List media attached to an incident      |
| GET    | `/api/evidence/media/<record_id>/download` | Decrypt + stream one media file  |
| GET    | `/api/evidence`             | List incidents (metadata only)                |
| GET    | `/api/evidence/<id>`        | Decrypt one incident                          |
| GET    | `/api/evidence/verify`      | Verify SHA-256 hash-chain integrity           |
| POST   | `/api/auth/token`           | Issue a demo JWT                              |

### Automatic evidence capture on SOS

Holding the SOS button for 2.5s:
1. Requests the browser's **Geolocation API** and attaches lat/lng/accuracy to the incident.
2. Requests **camera + microphone** access (`getUserMedia`) and shows a small live preview.
3. Captures a **JPEG photo** frame and a **~6s audio/video clip** (`MediaRecorder`, WebM).
4. Uploads both to `POST /api/evidence/<incident_id>/media`, where they're AES-256 encrypted and appended to the same SHA-256 hash chain as the incident record — so photos/clips can't be swapped or edited without breaking the chain.

If the user denies camera/mic/location permission, the SOS incident still logs immediately with whatever data is available (this is graceful, not a hard failure). All of this happens client-side in `frontend/src/utils/mediaCapture.js` and `frontend/src/components/SOSPanel.jsx`.

## Dataset

`backend/data/movement_data.csv` (2,100 rows) is a seeded, reproducible
synthetic dataset built to reflect realistic commuter behavior: kinematic
features (speed, stop duration, route deviation, direction changes) are
sampled with time-of-day and crowd-density-conditioned anomaly rates —
night hours and low-crowd/high-isolation conditions produce a higher
anomaly probability, matching the real-world safety patterns this project
targets. Regenerate anytime with `python ml/generate_dataset.py`.

## Production Notes

- Swap the Flask dev server for `gunicorn -w 4 -b 0.0.0.0:5000 app:app` (included in requirements.txt).
- Replace the file-based `evidence_vault.json` / `zones.json` stores with Firebase Realtime DB or another managed store for multi-instance deployments — the storage layer is isolated in `utils/` for a drop-in swap.
- Set real values for `JWT_SECRET`, `SafeStride_VAULT_KEY`, and `GOOGLE_MAPS_API_KEY` in `.env`.

## Tech Stack

Python · Flask · Scikit-learn (Isolation Forest) · Pandas/NumPy · cryptography (AES-256) · PyJWT · React · Vite · Leaflet.js/OpenStreetMap
