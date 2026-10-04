import React, { useState } from 'react'
import Dashboard from './components/Dashboard.jsx'
import RiskMap from './components/RiskMap.jsx'
import SOSPanel from './components/SOSPanel.jsx'
import EvidenceVault from './components/EvidenceVault.jsx'

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { key: 'map', label: 'Risk Map', icon: '📍' },
  { key: 'sos', label: 'SOS Panel', icon: '⚡' },
  { key: 'vault', label: 'Evidence Vault', icon: '🔐' },
]

export default function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="app-shell">
      <aside className="sidebar">
<div className="brand">
  <div className="brand-badge">
    <img
      src="/safestride-logo.png"
      alt="SafeStride Logo"
      style={{
        width: "38px",
        height: "38px",
        maxWidth: "38px",
        maxHeight: "38px",
        objectFit: "contain",
        display: "block",
        position: "static"
      }}
    />
  </div>

  <div>
    <div className="brand-title">SafeStride</div>
    <div className="brand-sub">WALK SAFETY AI</div>
  </div>
</div>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${page === n.key ? 'active' : ''}`}
            onClick={() => setPage(n.key)}
          >
            <span>{n.icon}</span> {n.label}
          </button>
        ))}
      </aside>
      <main className="main">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'map' && <RiskMap />}
        {page === 'sos' && <SOSPanel />}
        {page === 'vault' && <EvidenceVault />}
      </main>
    </div>
  )
}
