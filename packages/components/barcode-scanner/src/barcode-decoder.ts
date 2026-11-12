/** The barcode formats a scanner can be asked for, named as the browser's `BarcodeDetector` names them. */
export type BarcodeScanFormat =
  'aztec' | 'codabar' | 'code_39' | 'code_93' | 'code_128' | 'data_matrix' | 'ean_8' | 'ean_13' | 'itf' | 'pdf417' | 'qr_code' | 'upc_a' | 'upc_e'

/** One code read from a picture. */
export interface BarcodeScanResult {
  /** The text the code carries. */
  value: string
  /** Its format: a {@link BarcodeScanFormat}, or whatever else the decoder names. */
  format: string
  /** The code's corners in the picture handed to the decoder, in pixels, when the decoder locates it. */
  corners?: { x: number; y: number }[]
}

/**
 * Reads the codes of one picture. `formats` is the list the scanner was asked for (empty: every format the decoder
 * knows). A picture without a code resolves an empty list; a rejection is treated the same.
 */
export type BarcodeDecoder = (frame: ImageData, context: BarcodeDecoderContext) => Promise<BarcodeScanResult[]> | BarcodeScanResult[]

/** What a {@link BarcodeDecoder} is told about the picture it reads. */
export interface BarcodeDecoderContext {
  /** The formats the scanner was asked for; empty for every format the decoder knows. */
  formats: readonly string[]
  /** True for a still picture (`scanImage()`), worth a slower and more thorough reading than one frame of a camera. */
  still: boolean
}

interface NativeDetector {
  detect(source: ImageData): Promise<{ rawValue: string; format: string; cornerPoints?: { x: number; y: number }[] }[]>
}
interface NativeDetectorClass {
  new (options?: { formats?: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

/** Thrown by the built-in decoder when the browser has no `BarcodeDetector` and `@zxing/library` is not installed. */
export class BarcodeDecoderUnavailableError extends Error {
  /** Why the fallback could not be loaded. */
  readonly reason: unknown

  constructor(reason?: unknown) {
    super('c2-barcode-scanner: this browser has no BarcodeDetector for these formats. Install @zxing/library, or set the `decoder` property.')
    this.reason = reason
    this.name = 'BarcodeDecoderUnavailableError'
  }
}

async function nativeDecoder(formats: readonly string[]): Promise<BarcodeDecoder | undefined> {
  const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (!Detector) return undefined
  try {
    const supported = await Detector.getSupportedFormats()
    // A desktop browser may have the class and no format behind it, or lack one of those asked for.
    if (!supported.length || formats.some((format) => !supported.includes(format))) return undefined
    const detector = new Detector(formats.length ? { formats: [...formats] } : undefined)
    return async (frame) => (await detector.detect(frame)).map((code) => ({ value: code.rawValue, format: code.format, corners: code.cornerPoints }))
  } catch {
    return undefined
  }
}

let fallback: Promise<BarcodeDecoder> | undefined

/** The fallback decoder, loaded once per page with its library the first time a scanner needs it. */
function fallbackDecoder(): Promise<BarcodeDecoder> {
  fallback ??= import('./zxing-decoder.js').then(
    (module) => module.zxingDecoder,
    (error) => {
      fallback = undefined
      throw new BarcodeDecoderUnavailableError(error)
    },
  )
  return fallback
}

/**
 * The built-in decoder: the browser's `BarcodeDetector` where it reads the formats asked for (Chrome and Edge on
 * Android, macOS and ChromeOS), else `@zxing/library`, imported on the first scan. A native detector that fails
 * while scanning is replaced by the fallback for good.
 */
export function createBarcodeDecoder(): BarcodeDecoder {
  let key: string | undefined
  let engine: Promise<BarcodeDecoder> | undefined
  /** The engine for the current formats is the browser's detector. */
  let native = false
  /** The browser's detector failed while reading: it is not asked again. */
  let broken = false
  return async (frame, context) => {
    const wanted = context.formats.join(' ')
    if (!engine || wanted !== key) {
      key = wanted
      // A detector that lacks one list of formats is asked again for the next list.
      const pending = (broken ? Promise.resolve(undefined) : nativeDecoder(context.formats)).then((decoder) => {
        native = !!decoder
        return decoder ?? fallbackDecoder()
      })
      engine = pending
      // A fallback that failed to load is loaded again on the next reading, not remembered as a failure.
      pending.catch(() => engine === pending && (engine = undefined))
    }
    const decode = await engine
    try {
      return await decode(frame, context)
    } catch (error) {
      if (!native) throw error
      // The platform's detection service went away: read this frame, and every later one, with the fallback.
      native = false
      broken = true
      engine = undefined
      return (await fallbackDecoder())(frame, context)
    }
  }
}
