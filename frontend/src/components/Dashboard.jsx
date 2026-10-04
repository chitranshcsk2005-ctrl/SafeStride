import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'

const FACTOR_COLORS = {
  behavioral_anomaly: 'var(--purple)',
  isolation_index: 'var(--red)',
  temporal_risk: 'var(--amber)',
  crowd_signal: 'var(--green)',
  route_deviation: 'var(--blue)',
}
const FACTOR_LABELS = {
  behavioral_anomaly: 'Behavioral Anomaly',
  isolation_index: 'Isolation Index',
  temporal_risk: 'Temporal Risk',
  crowd_signal: 'Crowd Signal',
  route_deviation: 'Route Deviation',
}

function riskColor(score) {
  if (score >= 80) return 'var(--red)'
  if (score >= 60) return 'var(--amber)'
  if (score >= 35) return 'var(--blue)'
  return 'var(--green)'
}

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [zones, setZones] = useState([])
  const [scoreResult, setScoreResult] = useState(null)
  const [selectedZone, setSelectedZone] = useState('zone-01')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [s, z] = await Promise.all([api.dashboardStats(), api.getZones()])
      setStats(s)
      setZones(z.sort((a, b) => b.current_risk - a.current_risk))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  const runSimulation = async () => {
    setLoading(true)
    setError('')
    const hour = new Date().getHours()
    const sample = {
      zone_id: selectedZone,
      hour_of_day: hour,
      speed_kmph: +(Math.random() * 8 + 1).toFixed(1),
      stop_duration_sec: Math.round(Math.random() * 200),
      route_deviation_m: Math.round(Math.random() * 260),
      isolation_score: +Math.random().toFixed(2),
      crowd_density: +Math.random().toFixed(2),
      dwell_events: Math.round(Math.random() * 3),
      direction_changes: Math.round(Math.random() * 5),
    }
    try {
      const res = await api.computeThreatScore(sample)
      setScoreResult(res)
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const score = scoreResult?.threat_score ?? stats?.threat_score ?? 0
  const level = scoreResult?.risk_level ?? 'LOW RISK'

  return (
    <div>
      <div className="page-header">
        <h1>Real-Time Intelligence Dashboard</h1>
        <p>Predictive urban safety — live multi-factor risk monitoring</p>
      </div>

      {error && <div className="footer-note" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{error}</div>}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card card-top-accent" style={{ '--accent': 'var(--red)' }}>
          <div className="stat-value">{stats ? `${stats.threat_score}/100` : '—'}</div>
          <div className="stat-label">Threat Score</div>
        </div>
        <div className="card card-top-accent" style={{ '--accent': 'var(--amber)' }}>
          <div className="stat-value">{stats ? stats.active_alerts : '—'}</div>
          <div className="stat-label">Active Alerts (zones ≥ 70)</div>
        </div>
        <div className="card card-top-accent" style={{ '--accent': 'var(--purple)' }}>
          <div className="stat-value">{stats ? stats.zones_live : '—'}</div>
          <div className="stat-label">Zones Live</div>
        </div>
        <div className="card card-top-accent" style={{ '--accent': 'var(--green)' }}>
          <div className="stat-value">{stats ? `${stats.detection_latency_ms}ms` : '—'}</div>
          <div className="stat-label">Detection Latency</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Live Threat Score</h3>
          <div className="gauge-wrap">
            <div className="gauge-score" style={{ color: riskColor(score) }}>{score}</div>
            <div className="gauge-level" style={{ color: riskColor(score) }}>{level}</div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="form-field">
              <label>Simulate movement sample in zone</label>
              <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ alignSelf: 'end' }}>
              <button className="pill-btn" onClick={runSimulation} disabled={loading}>
                {loading ? 'Computing…' : 'Run Detection'}
              </button>
            </div>
          </div>

          {scoreResult && (
            <div style={{ marginTop: 18 }}>
              {Object.entries(scoreResult.factors).map(([key, val]) => (
                <div className="factor-row" key={key}>
                  <div className="label-row">
                    <span>{FACTOR_LABELS[key]}</span>
                    <span style={{ color: FACTOR_COLORS[key] }}>{val}%</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${val}%`, background: FACTOR_COLORS[key] }} />
                  </div>
                </div>
              ))}
              <div className="footer-note">
                Stage: <b>{scoreResult.stage.replaceAll('_', ' ')}</b> · Anomaly flagged: <b>{String(scoreResult.is_anomaly)}</b>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Micro-Zones (Greater Noida)</h3>
          {zones.map((z) => (
            <div className="zone-list-item" key={z.id}>
              <span>
                <span className="zone-dot" style={{ background: riskColor(z.current_risk) }} />
                {z.name}
              </span>
              <b className="mono" style={{ color: riskColor(z.current_risk) }}>{z.current_risk}</b>
            </div>
          ))}
          <button className="pill-btn" style={{ marginTop: 14, width: '100%' }} onClick={() => onNavigate('map')}>
            View Risk Map →
          </button>
        </div>
      </div>
    </div>
  )
}
