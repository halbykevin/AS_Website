// Reading QR codes from the phone's camera.
//
// Chrome on Android has a QR reader built in (BarcodeDetector) — fast, and
// it reads codes at an angle. Safari doesn't, so there jsQR decodes a
// downscaled frame instead, loaded only then. Either way the camera is looked
// at about eight times a second, which is plenty for someone holding a ticket
// up and leaves the phone cool through a whole evening at the door.

const EVERY_MS = 120

/**
 * Start the camera into `video` and call `onText` with every code it reads.
 * Resolves with a stop() function. Throws if there is no camera, or the
 * browser was refused permission — the caller says which.
 */
export async function startCamera(video, onText, { facingMode = 'environment' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('No camera here'), { name: 'NotSupportedError' })
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  video.setAttribute('playsinline', '') // iOS: play here, not full screen
  video.muted = true
  video.srcObject = stream
  await video.play().catch(() => {})

  let detector = null
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats()
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    } catch {
      /* fall back to jsQR */
    }
  }
  const jsQR = detector ? null : (await import('jsqr')).default
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  let stopped = false
  let timer = 0
  async function look() {
    if (stopped) return
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        let text = ''
        if (detector) {
          const found = await detector.detect(video)
          text = found[0]?.rawValue || ''
        } else {
          const w = Math.min(640, video.videoWidth)
          const h = Math.round((video.videoHeight * w) / video.videoWidth)
          canvas.width = w
          canvas.height = h
          ctx.drawImage(video, 0, 0, w, h)
          text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data || ''
        }
        if (text && !stopped) onText(text)
      }
    } catch {
      /* a frame that couldn't be read; try the next */
    }
    timer = setTimeout(look, EVERY_MS)
  }
  look()

  return () => {
    stopped = true
    clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
    video.srcObject = null
  }
}

// A beep you can hear over a crowd, and a buzz you can feel — no sound files.
let audio = null
export function unlockSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
  } catch {
    audio = null
  }
}

export function signal(ok) {
  try {
    navigator.vibrate?.(ok ? 80 : [220, 90, 220])
  } catch {
    /* no vibration */
  }
  if (!audio) return
  const tones = ok ? [[1046, 0, 0.09], [1318, 0.11, 0.12]] : [[196, 0, 0.45]]
  for (const [hz, start, length] of tones) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = ok ? 'sine' : 'square'
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.0001, audio.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + length)
    osc.connect(gain).connect(audio.destination)
    osc.start(audio.currentTime + start)
    osc.stop(audio.currentTime + start + length + 0.02)
  }
}
