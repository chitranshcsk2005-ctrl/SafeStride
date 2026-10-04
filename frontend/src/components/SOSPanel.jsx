import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { getLocation, openMediaStream, stopStream, capturePhoto, recordClip } from '../utils/mediaCapture.js'

const STAGES = [
  { key: 'SILENT_MONITOR', label: 'Silent Monitor', color: 'var(--green)' },
  { key: 'VIBRATE_ALERT', label: 'Vibrate Alert', color: 'var(--blue)' },
  { key: 'LOCATION_SHARE', label: 'Location Share', color: 'var(--amber)' },
  { key: 'EMERGENCY_DISPATCH', label: 'Emergency Dispatch', color: 'var(--red)' },
]
const HOLD_MS = 2500
const CLIP_MS = 30000

export default function SOSPanel() {
  const [pct, setPct] = useState(0)
  const [holding, setHolding] = useState(false)
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState('zone-01')
  const [lastResult, setLastResult] = useState(null)
  const [attachedMedia, setAttachedMedia] = useState([])
  const [captureStatus, setCaptureStatus] = useState('')
  const [previewActive, setPreviewActive] = useState(false)
  const [error, setError] = useState('')

  const rafRef = useRef(null)
  const startRef = useRef(0)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const locationPromiseRef = useRef(null)
  const firedRef = useRef(false)


  useEffect(() => {
    api.getZones().then(setZones)
    return () => stopStream(streamRef.current)
  }, [])

  const tick = (ts) => {
    if (!startRef.current) startRef.current = ts
    const elapsed = ts - startRef.current
    const p = Math.min(100, (elapsed / HOLD_MS) * 100)
    setPct(p)
    if (p >= 100) {
      fireSOS()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

const startHold = async () => {
  firedRef.current = false
  setHolding(true)
  setError('')
  setLastResult(null)
  setAttachedMedia([])
  startRef.current = 0
    // Kick off location + camera/mic access as soon as the hold begins,
    // so both are ready (or gracefully unavailable) by the time the
    // 2.5s hold completes.
    locationPromiseRef.current = getLocation()
    openMediaStream().then((stream) => {
      streamRef.current = stream
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream
        setPreviewActive(true)
      }
    })

    rafRef.current = requestAnimationFrame(tick)
  }

  // stopMedia=false is used when the hold *completed* (SOS firing) so the
  // live camera/mic stream survives long enough to capture evidence.
  // stopMedia=true (default) is used for a released/cancelled hold.
  const cancelHold = (stopMedia = true) => {
    setHolding(false)
    setPct(0)
    startRef.current = 0
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (stopMedia) {
        stopStream(streamRef.current)
        streamRef.current = null
        setPreviewActive(false)
      }
    }
  
    // Ignores button-release once SOS has already fired, so photo/video
    // capture keeps running in the background after you let go.
    const releaseHold = () => {
      if (firedRef.current) return
      cancelHold(true)
    }
  
    const fireSOS = async () => {
    firedRef.current = true
    cancelHold(false)
    const zone = zones.find((z) => z.id === zoneId)
    try {
      const location = await locationPromiseRef.current
      const res = await api.triggerSOS({
        zone_id: zoneId,
        threat_score: zone ? zone.current_risk : 90,
        severity: 'critical',
        notes: 'SOS held for 2.5s by user on SafeStride client',
        lat: location?.lat,
        lng: location?.lng,
        location_accuracy_m: location?.location_accuracy_m,
      })
      setLastResult(res)
      await captureAndUploadEvidence(res.incident.incident_id)
    } catch (e) {
      setError(e.message)
    }
  }

  const captureAndUploadEvidence = async (incidentId) => {
    const stream = streamRef.current
    if (!stream) {
      setCaptureStatus('No camera/mic access - incident logged with text + location only.')
      setTimeout(() => setCaptureStatus(''), 4000)
      return
    }
    const media = []
    try {
      setCaptureStatus('Capturing photo evidence…')
      const photoBlob = await capturePhoto(videoRef.current)
      if (photoBlob) {
        const rec = await api.uploadMedia(incidentId, photoBlob, 'photo', 'sos-photo.jpg')
        media.push(rec)
      }

      setCaptureStatus(`Recording ${CLIP_MS / 1000}s audio/video evidence…`)
      const clipBlob = await recordClip(stream, { durationMs: CLIP_MS })
      if (clipBlob) {
        setCaptureStatus('Uploading encrypted evidence…')
        const rec = await api.uploadMedia(incidentId, clipBlob, 'video', 'sos-clip.webm')
        media.push(rec)
      }
      setCaptureStatus('Evidence encrypted and stored in vault.')
    } catch (e) {
      setCaptureStatus(`Evidence capture failed: ${e.message}`)
    } finally {
      stopStream(stream)
      streamRef.current = null
      setPreviewActive(false)
      setAttachedMedia(media)
      firedRef.current = false
      setTimeout(() => setCaptureStatus(''), 5000)
    }
  }

  const activeStageIndex = lastResult ? STAGES.findIndex((s) => s.key === lastResult.stage) : -1

  return (
    <div>
      <div className="page-header">
        <h1>SOS Emergency Protocol</h1>
        <p>Hold 2.5s to activate escalation, capture location, and record evidence</p>
      </div>

      {error && <div className="footer-note" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{error}</div>}

      <div className="grid grid-2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="form-field" style={{ width: '100%', marginBottom: 20 }}>
            <label>Current zone</label>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name} — risk {z.current_risk}</option>
              ))}
            </select>
          </div>

          <button
            className="sos-button"
            style={{ '--pct': pct }}
            onMouseDown={startHold}
            onMouseUp={releaseHold}
            onMouseLeave={releaseHold}
            onTouchStart={startHold}
            onTouchEnd={releaseHold}
          >
            <div className="sos-progress" />
            SOS
            <span className="hint">{holding ? 'Keep holding…' : 'Hold to activate'}</span>
          </button>

          {/* Muted local preview - also used as the source frame for photo capture */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: previewActive ? 160 : 0,
              height: previewActive ? 120 : 0,
              borderRadius: 8,
              marginTop: previewActive ? 14 : 0,
              border: previewActive ? '1px solid var(--panel-border)' : 'none',
              transition: 'all .2s',
            }}
          />

          {captureStatus && (
            <div className="footer-note" style={{ width: '100%', marginTop: 14 }}>{captureStatus}</div>
          )}

          <div className="stage-track" style={{ width: '100%' }}>
            {STAGES.map((s, i) => (
              <div
                key={s.key}
                className={`stage-pill ${i <= activeStageIndex ? 'on' : ''}`}
                style={i <= activeStageIndex ? { background: s.color, borderColor: s.color } : {}}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Last Incident</h3>
          {lastResult ? (
            <>
              <table>
                <tbody>
                  <tr><td>Incident ID</td><td className="mono">{lastResult.incident.incident_id.slice(0, 8)}…</td></tr>
                  <tr><td>Zone</td><td>{lastResult.incident.zone_name}</td></tr>
                  <tr><td>Severity</td><td>{lastResult.incident.severity}</td></tr>
                  <tr><td>Threat Score</td><td>{lastResult.incident.threat_score}</td></tr>
                  <tr><td>Stage</td><td>{lastResult.stage.replaceAll('_', ' ')}</td></tr>
                  <tr><td>Location</td><td>{lastResult.incident.has_location ? 'Captured' : 'Unavailable'}</td></tr>
                  <tr><td>Timestamp</td><td>{lastResult.incident.timestamp}</td></tr>
                  <tr><td>Record Hash</td><td className="mono" style={{ fontSize: 11 }}>{lastResult.incident.record_hash.slice(0, 16)}…</td></tr>
                </tbody>
              </table>

              {attachedMedia.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 14, marginBottom: 8 }}>Attached Evidence</h3>
                  {attachedMedia.map((m) => (
                    <div key={m.record_id} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                        {m.media_type} · {(m.size_bytes / 1024).toFixed(1)} KB · {m.mime_type}
                      </div>
                      {m.media_type === 'photo' ? (
                        <img src={api.mediaDownloadUrl(m.record_id)} alt="SOS capture" style={{ maxWidth: '100%', borderRadius: 8 }} />
                      ) : (
                        <video src={api.mediaDownloadUrl(m.record_id)} controls style={{ maxWidth: '100%', borderRadius: 8 }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">No incident triggered yet. Auto-logs to the encrypted Evidence Vault on activation.</div>
          )}
        </div>
      </div>

      <div className="footer-note">
        SOS captures live location + a photo + short A/V clip (with your permission) and auto-logs to the vault ·
        Every incident and media file is AES-256 encrypted and SHA-256 hash-chained · If camera/mic/location access is denied, the incident still logs with the data that is available.
      </div>
    </div>
  )
}
