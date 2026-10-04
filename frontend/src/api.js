const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export const api = {
  health: () => request('/health'),
  getZones: () => request('/zones'),
  getZone: (id) => request(`/zones/${id}`),
  dashboardStats: () => request('/dashboard/stats'),
  computeThreatScore: (sample) =>
    request('/threat-score', { method: 'POST', body: JSON.stringify(sample) }),
  triggerSOS: (payload) =>
    request('/sos', { method: 'POST', body: JSON.stringify(payload) }),
  listEvidence: () => request('/evidence'),
  getEvidence: (id) => request(`/evidence/${id}`),
  verifyChain: () => request('/evidence/verify'),

  // Media evidence (photo / audio / video captured on SOS)
  uploadMedia: async (incidentId, blob, mediaType, filename) => {
    const form = new FormData()
    form.append('media_type', mediaType)
    form.append('file', blob, filename)
    const res = await fetch(`${BASE_URL}/evidence/${incidentId}/media`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  },
  listMedia: (incidentId) => request(`/evidence/${incidentId}/media`),
  mediaDownloadUrl: (recordId) => `${BASE_URL}/evidence/media/${recordId}/download`,
}
