// Browser-side evidence capture: geolocation + camera photo + short A/V clip.
// All capture is best-effort and permission-gated - if the user denies
// camera/mic/location access, the SOS incident still logs (text-only).

export function getLocation(timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    const timer = setTimeout(() => resolve(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          location_accuracy_m: Math.round(pos.coords.accuracy),
        })
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs }
    )
  })
}

export async function openMediaStream() {
  if (!navigator.mediaDevices?.getUserMedia) return null
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  } catch {
    // Camera/mic denied or unavailable - degrade gracefully.
    return null
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop())
}

/** Grabs a single JPEG frame from a live video element as a Blob. */
export function capturePhoto(videoEl) {
  return new Promise((resolve) => {
    if (!videoEl || !videoEl.videoWidth) {
      resolve(null)
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth
    canvas.height = videoEl.videoHeight
    canvas.getContext('2d').drawImage(videoEl, 0, 0)
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85)
  })
}

/** Records a short (default 6s) audio+video clip from the given stream. */
export function recordClip(stream, { durationMs = 6000, mimeType } = {}) {
  return new Promise((resolve) => {
    if (!stream || !window.MediaRecorder) {
      resolve(null)
      return
    }
    const type = mimeType && MediaRecorder.isTypeSupported(mimeType)
      ? mimeType
      : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
          .find((t) => MediaRecorder.isTypeSupported?.(t)) || ''

    const chunks = []
    let recorder
    try {
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    } catch {
      resolve(null)
      return
    }
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
    recorder.onstop = () => resolve(new Blob(chunks, { type: type || 'video/webm' }))
    recorder.start()
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, durationMs)
  })
}
