import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * The camera core of `@c2n/camera-capture`: opening a camera, showing it in a `<video>`, switching between the front
 * and the back camera, and closing it. It knows nothing of photos, so every camera element of the package shares it.
 */

/** Which camera to open: the one facing the user (front, a selfie) or the one facing away (back, a document). */
export type CameraFacing = 'user' | 'environment'

/** What a camera element asks a {@link CameraStreamSource} for. */
export interface CameraStreamRequest {
  /** The camera wanted. A source that cannot choose may ignore it. */
  facing: CameraFacing
  /** The ideal frame size, in pixels. A source may return another one. */
  width: number
  height: number
}

/**
 * Supplies the video stream a camera element shows, in place of `navigator.mediaDevices.getUserMedia`: a camera
 * chosen by device id, a stream from WebRTC, or a canvas `captureStream()` in a demo or a test. A rejection is shown as
 * an error; a `DOMException` keeps its meaning (`NotAllowedError` reads as access denied).
 */
export type CameraStreamSource = (request: CameraStreamRequest) => Promise<MediaStream>

/** Why a camera did not start, or (`ended`) why an open one stopped. */
export type CameraErrorKind = 'denied' | 'not-found' | 'busy' | 'unsupported' | 'ended' | 'unknown'

/** Classifies a `getUserMedia` rejection. */
export function cameraErrorKind(error: unknown): CameraErrorKind {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    case 'NotSupportedError':
    case 'TypeError':
      return 'unsupported'
    default:
      return 'unknown'
  }
}

/** The browser's camera, through `getUserMedia`. */
export const browserCameraSource: CameraStreamSource = (request) => {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (!media?.getUserMedia) return Promise.reject(new DOMException('No camera API in this context', 'NotSupportedError'))
  return media.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: request.facing }, width: { ideal: request.width }, height: { ideal: request.height } },
  })
}

/** Opens a camera into a host's `<video>` and closes it when asked or when the host leaves the page. */
export class CameraController implements ReactiveController {
  /** The open stream, or null. */
  stream: MediaStream | null = null
  /** How many cameras the device reports, once one was opened (labels and counts need the permission). */
  cameras = 0

  private attempt = 0

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly video: () => HTMLVideoElement | null | undefined,
    private readonly onEnded?: () => void,
  ) {
    host.addController(this)
  }

  /**
   * Opens the camera and plays it in the video. Resolves once the first frame has a size; rejects with the
   * source's error. A later call, or `stop()`, supersedes this one: its stream is closed and it resolves `false`.
   */
  async start(request: CameraStreamRequest, source: CameraStreamSource = browserCameraSource): Promise<boolean> {
    const attempt = ++this.attempt
    this.close()
    let stream: MediaStream
    try {
      stream = await source(request)
    } catch (error) {
      // A request a later call or stop() replaced is no longer anyone's error.
      if (attempt !== this.attempt) return false
      throw error
    }
    if (attempt !== this.attempt) {
      stopTracks(stream)
      return false
    }
    this.stream = stream
    // A track ends on its own when the camera is unplugged or the permission revoked; stop() does not fire it.
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', this.handleEnded)
    await this.host.updateComplete
    const video = this.video()
    if (!video) {
      this.close()
      return false
    }
    video.srcObject = stream
    await whenSized(video)
    // Autoplay of a muted inline video is allowed, but play() still rejects when the element is detached meanwhile.
    await video.play().catch(() => undefined)
    if (attempt !== this.attempt) return false
    this.cameras = await countCameras()
    this.host.requestUpdate()
    return true
  }

  /** Closes the camera. */
  stop() {
    this.attempt++
    this.close()
  }

  hostDisconnected() {
    this.stop()
  }

  private readonly handleEnded = () => {
    if (this.stream) this.onEnded?.()
  }

  /** True when a track of the open stream has ended without `stop()`: the camera went away. */
  get ended(): boolean {
    return !!this.stream?.getVideoTracks().some((track) => track.readyState === 'ended')
  }

  private close() {
    if (this.stream) {
      for (const track of this.stream.getVideoTracks()) track.removeEventListener('ended', this.handleEnded)
      stopTracks(this.stream)
    }
    this.stream = null
    const video = this.video()
    if (video) video.srcObject = null
  }
}

/** A rectangle of a video frame, in the video's own pixels. */
export interface CameraRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The part of the video frame shown under `box`, in the video's own pixels. The video fills `stage` with
 * `object-fit: cover`, so the box is mapped through that scale and offset, and mirrored back when the picture is.
 */
export function coverRegion(
  video: HTMLVideoElement,
  stage: Element | null | undefined,
  box: Element | null | undefined,
  mirrored: boolean,
): CameraRegion | undefined {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!stage || !box || !vw || !vh) return undefined
  const outer = stage.getBoundingClientRect()
  const inner = box.getBoundingClientRect()
  if (!outer.width || !outer.height || !inner.width || !inner.height) return undefined
  const scale = Math.max(outer.width / vw, outer.height / vh)
  const offsetX = (outer.width - vw * scale) / 2
  const offsetY = (outer.height - vh * scale) / 2
  let left = inner.left - outer.left
  if (mirrored) left = outer.width - left - inner.width
  const x = Math.max(0, (left - offsetX) / scale)
  const y = Math.max(0, (inner.top - outer.top - offsetY) / scale)
  const width = Math.min(vw - x, inner.width / scale)
  const height = Math.min(vh - y, inner.height / scale)
  return width > 0 && height > 0 ? { x, y, width, height } : undefined
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop()
}

/** Resolves once the video knows its frame size (or after two seconds, for a source that never says). */
function whenSized(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('resize', done)
      resolve()
    }
    const timer = setTimeout(done, 2000)
    video.addEventListener('loadedmetadata', done)
    video.addEventListener('resize', done)
  })
}

async function countCameras(): Promise<number> {
  try {
    const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? []
    return devices.filter((device) => device.kind === 'videoinput').length
  } catch {
    return 0
  }
}
