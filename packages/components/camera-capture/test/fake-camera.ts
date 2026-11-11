import type { CameraStreamRequest, CameraStreamSource } from '../src/camera'

/** What the fake camera films: a card on a desk, held still or shaking, in the dark, or burnt out by a light. */
export type FakeScene = 'steady' | 'moving' | 'dark' | 'glare'

export interface FakeCamera {
  scene: FakeScene
  /** Every request the source received. */
  requests: CameraStreamRequest[]
  /** The streams it handed out, to check they are stopped. */
  streams: MediaStream[]
  /** When set, the next request rejects with this DOMException name. */
  failWith: string | undefined
  /** Milliseconds the next request waits before answering, as a permission prompt does. */
  delay: number
  source: CameraStreamSource
}

/**
 * A camera made of a canvas: `captureStream()` turns what it draws into a video track in every engine, so the suite
 * needs no camera, no permission prompt and no fake-device flag.
 */
export function fakeCamera(): FakeCamera {
  const camera: FakeCamera = {
    scene: 'steady',
    requests: [],
    streams: [],
    failWith: undefined,
    delay: 0,
    source: async (request) => {
      camera.requests.push(request)
      if (camera.delay) await new Promise((resolve) => setTimeout(resolve, camera.delay))
      if (camera.failWith) {
        const name = camera.failWith
        camera.failWith = undefined
        throw new DOMException('Fake camera failure', name)
      }
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const context = canvas.getContext('2d')!
      let frame = 0
      const draw = () => {
        frame++
        const shake = camera.scene === 'moving' ? (frame % 2 ? 40 : -40) : 0
        context.fillStyle = camera.scene === 'dark' ? '#0a0a0a' : camera.scene === 'glare' ? '#ffffff' : '#6b7280'
        context.fillRect(0, 0, 640, 480)
        if (camera.scene === 'dark' || camera.scene === 'glare') return
        // A card with printed lines: edges the blur check can see, and a mark that tells the facing apart.
        context.fillStyle = '#f8fafc'
        context.fillRect(120 + shake, 140, 400, 252)
        context.fillStyle = '#1e3a8a'
        for (let line = 0; line < 6; line++) context.fillRect(150 + shake, 170 + line * 34, 200 + (line % 3) * 40, 12)
        context.fillStyle = '#dc2626'
        context.fillRect(0, 0, 40, 40)
      }
      draw()
      const timer = setInterval(draw, 33)
      const stream = canvas.captureStream(30)
      // A stopped track ends the drawing too.
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => {
          clearInterval(timer)
          stop()
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
    fakeCamera: FakeCamera
  }
}
