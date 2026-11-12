import { encodeBarcode, type BarcodeFormat } from '../../barcode/src/encode'
import type { CameraStreamRequest, CameraStreamSource } from '../src/barcode-scanner'

export interface FakeBarcodeCamera {
  /** The code on the label the camera films, or null for a label with nothing printed. */
  code: { value: string; format: BarcodeFormat } | null
  /** Gives the camera a light the scanner can drive. */
  hasTorch: boolean
  /** Every light state the scanner asked for. */
  torch: boolean[]
  requests: CameraStreamRequest[]
  streams: MediaStream[]
  source: CameraStreamSource
  /** A still picture of the label, as a PNG. */
  picture(): Promise<Blob>
}

/** Paints the label the camera films: grey desk, white label, and the code when there is one. */
function paintLabel(context: CanvasRenderingContext2D, label: FakeBarcodeCamera['code'], tick: number) {
  context.fillStyle = '#6b7280'
  context.fillRect(0, 0, 640, 480)
  // A corner mark that changes every frame, outside the scan window: the stream always has a new frame.
  context.fillStyle = tick % 2 ? '#dc2626' : '#2563eb'
  context.fillRect(0, 0, 24, 24)
  context.fillStyle = '#ffffff'
  context.fillRect(150, 120, 340, 240)
  if (!label) return
  const code = encodeBarcode(label.value, label.format)
  context.fillStyle = '#000000'
  if (code.kind === 'linear') {
    const unit = 2
    const left = Math.round(320 - (code.modules.length * unit) / 2)
    code.modules.forEach((bar, x) => bar && context.fillRect(left + x * unit, 180, unit, 120))
  } else {
    const unit = Math.floor(160 / code.rows.length)
    const left = Math.round(320 - (code.rows[0].length * unit) / 2)
    const top = Math.round(240 - (code.rows.length * unit) / 2)
    code.rows.forEach((row, y) => row.forEach((dark, x) => dark && context.fillRect(left + x * unit, top + y * unit, unit, unit)))
  }
}

/** A camera made of a canvas that films a label with a barcode printed by the repo's own encoder. */
export function fakeBarcodeCamera(): FakeBarcodeCamera {
  const camera: FakeBarcodeCamera = {
    code: { value: 'C2N-12345', format: 'code128' },
    hasTorch: false,
    torch: [],
    requests: [],
    streams: [],
    picture: () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      paintLabel(canvas.getContext('2d')!, camera.code, 0)
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/png'))
    },
    source: async (request) => {
      camera.requests.push(request)
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const context = canvas.getContext('2d')!
      let tick = 0
      const draw = () => paintLabel(context, camera.code, tick++)
      draw()
      const timer = setInterval(draw, 33)
      const stream = canvas.captureStream(30)
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => {
          clearInterval(timer)
          stop()
        }
        if (camera.hasTorch) {
          track.getCapabilities = () => ({ torch: true }) as MediaTrackCapabilities
          track.applyConstraints = async (constraints) => {
            camera.torch.push(!!(constraints?.advanced?.[0] as { torch?: boolean } | undefined)?.torch)
          }
        }
      }
      camera.streams.push(stream)
      return stream
    },
  }
  return camera
}

declare global {
  interface Window {
    fakeBarcodeCamera: FakeBarcodeCamera
  }
}
