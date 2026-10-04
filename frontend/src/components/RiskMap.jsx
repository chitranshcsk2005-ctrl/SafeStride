import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { api } from '../api.js'
import 'leaflet/dist/leaflet.css'

function riskColor(score) {
  if (score >= 80) return '#ff4d6a'
  if (score >= 60) return '#f5a623'
  if (score >= 35) return '#3d8bfd'
  return '#10e0a0'
}

export default function RiskMap() {
  const [zones, setZones] = useState([])

  useEffect(() => {
    const load = () => api.getZones().then((z) => setZones(z.sort((a, b) => b.current_risk - a.current_risk)))
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [])

  const center = [28.4711, 77.5040]

  return (
    <div>
      <div className="page-header">
        <h1>Micro-Zone Risk Map</h1>
        <p>Greater Noida — geospatial clustering with real-time risk recalculation</p>
      </div>

      <div className="grid grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="map-container">
          <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {zones.map((z) => (
              <CircleMarker
                key={z.id}
                center={[z.lat, z.lng]}
                radius={14 + z.current_risk / 8}
                pathOptions={{ color: riskColor(z.current_risk), fillColor: riskColor(z.current_risk), fillOpacity: 0.35 }}
              >
                <Popup>
                  <b>{z.name}</b><br />
                  Risk: {z.current_risk}/100<br />
                  Category: {z.category}<br />
                  CCTV coverage: {Math.round(z.cctv_coverage * 100)}%
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Risk Zones</h3>
          {zones.map((z) => (
            <div className="zone-list-item" key={z.id}>
              <span>
                <span className="zone-dot" style={{ background: riskColor(z.current_risk) }} />
                {z.name}
              </span>
              <b className="mono" style={{ color: riskColor(z.current_risk) }}>{z.current_risk}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="footer-note">
        Leaflet.js + OpenStreetMap · {zones.length} active risk zones · Risk recalculated from live threat-score submissions
      </div>
    </div>
  )
}
