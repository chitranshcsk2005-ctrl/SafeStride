import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

function sevColor(sev) {
  if (sev === 'critical') return 'var(--red)'
  if (sev === 'high') return 'var(--amber)'
  return 'var(--blue)'
}

export default function EvidenceVault() {
  const [records, setRecords] = useState([])
  const [chainOk, setChainOk] = useState(null)
  const [openRecord, setOpenRecord] = useState(null)
  const [openMedia, setOpenMedia] = useState([])

  const load = () => {
    api.listEvidence().then(setRecords)
    api.verifyChain().then((r) => setChainOk(r.chain_intact))
  }

  useEffect(() => { load() }, [])

  const view = async (id) => {
    const [data, media] = await Promise.all([api.getEvidence(id), api.listMedia(id)])
    setOpenRecord(data)
    setOpenMedia(media)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Evidence Vault</h1>
        <p>AES-256 encrypted incidents + media · SHA-256 tamper-evident hash chain</p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card card-top-accent" style={{ '--accent': 'var(--purple)' }}>
          <div className="stat-value">{records.length}</div>
          <div className="stat-label">Total Incidents</div>
        </div>
        <div className="card card-top-accent" style={{ '--accent': 'var(--red)' }}>
          <div className="stat-value">{records.filter((r) => r.severity === 'critical').length}</div>
          <div className="stat-label">Critical</div>
        </div>
        <div className="card card-top-accent" style={{ '--accent': 'var(--amber)' }}>
          <div className="stat-value">{records.filter((r) => r.severity === 'high').length}</div>
          <div className="stat-label">High</div>
        </div>
        <div className="card card-top-accent" style={{ '--accent': chainOk ? 'var(--green)' : 'var(--red)' }}>
          <div className="stat-value" style={{ color: chainOk ? 'var(--green)' : 'var(--red)' }}>
            {chainOk === null ? '—' : chainOk ? 'Intact' : 'Tampered'}
          </div>
          <div className="stat-label">Chain Integrity</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Incident Log</h3>
          <button className="pill-btn" onClick={load}>Refresh</button>
        </div>
        {records.length === 0 ? (
          <div className="empty-state">No incidents logged yet. Trigger SOS to create an entry.</div>
        ) : (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Timestamp</th><th>Zone</th><th>Severity</th><th>Score</th><th>Stage</th><th>Location</th><th>Hash</th><th></th>
              </tr>
            </thead>
            <tbody>
              {[...records].reverse().map((r) => (
                <tr key={r.incident_id}>
                  <td>{r.timestamp}</td>
                  <td>{r.zone_name}</td>
                  <td><span className="badge" style={{ background: sevColor(r.severity), color: '#0b0e17' }}>{r.severity}</span></td>
                  <td>{r.threat_score}</td>
                  <td>{r.stage.replaceAll('_', ' ')}</td>
                  <td>{r.has_location ? '📍' : '—'}</td>
                  <td className="mono">{r.record_hash.slice(0, 10)}…</td>
                  <td><button className="pill-btn" onClick={() => view(r.incident_id)}>Decrypt</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openRecord && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Decrypted Incident — {openRecord.incident_id}</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-dim)' }}>
            {JSON.stringify(openRecord, null, 2)}
          </pre>

          {openRecord.lat != null && (
            <div className="footer-note">
              📍 Captured location: {openRecord.lat.toFixed(5)}, {openRecord.lng.toFixed(5)}
              {openRecord.location_accuracy_m != null && ` (±${openRecord.location_accuracy_m}m)`}
            </div>
          )}

          <h3 style={{ fontSize: 14, marginTop: 18 }}>Attached Media ({openMedia.length})</h3>
          {openMedia.length === 0 ? (
            <div className="empty-state">No photo/audio/video evidence attached to this incident.</div>
          ) : (
            openMedia.map((m) => (
              <div key={m.record_id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                  {m.media_type} · {(m.size_bytes / 1024).toFixed(1)} KB · sha256:{m.checksum_sha256.slice(0, 12)}…
                </div>
                {m.media_type === 'photo' ? (
                  <img src={api.mediaDownloadUrl(m.record_id)} alt="evidence" style={{ maxWidth: 320, borderRadius: 8 }} />
                ) : (
                  <video src={api.mediaDownloadUrl(m.record_id)} controls style={{ maxWidth: 320, borderRadius: 8 }} />
                )}
              </div>
            ))
          )}
        </div>
      )}

      <div className="footer-note">
        Every record — incident or media — chains its SHA-256 hash to the previous record. Any edit anywhere in the vault breaks every hash after it, which is verified live above.
      </div>
    </div>
  )
}
