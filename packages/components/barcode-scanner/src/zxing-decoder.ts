import {
  AztecCodeReader,
  BarcodeFormat,
  BinaryBitmap,
  DataMatrixReader,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  PDF417Reader,
  QRCodeReader,
  RGBLuminanceSource,
  type Reader,
} from '@zxing/library'
import type { BarcodeDecoder, BarcodeScanResult } from './barcode-decoder'

/** The library's formats under the names `BarcodeDetector` gives them. */
const FORMATS: Record<string, BarcodeFormat> = {
  aztec: BarcodeFormat.AZTEC,
  codabar: BarcodeFormat.CODABAR,
  code_39: BarcodeFormat.CODE_39,
  code_93: BarcodeFormat.CODE_93,
  code_128: BarcodeFormat.CODE_128,
  data_matrix: BarcodeFormat.DATA_MATRIX,
  ean_8: BarcodeFormat.EAN_8,
  ean_13: BarcodeFormat.EAN_13,
  itf: BarcodeFormat.ITF,
  pdf417: BarcodeFormat.PDF_417,
  qr_code: BarcodeFormat.QR_CODE,
  upc_a: BarcodeFormat.UPC_A,
  upc_e: BarcodeFormat.UPC_E,
}
const NAMES = new Map(Object.entries(FORMATS).map(([name, format]) => [format, name]))
const MATRIX: [string, () => Reader][] = [
  ['qr_code', () => new QRCodeReader()],
  ['data_matrix', () => new DataMatrixReader()],
  ['aztec', () => new AztecCodeReader()],
  ['pdf417', () => new PDF417Reader()],
]

const readers = new Map<string, { reader: Reader; hints: Map<DecodeHintType, unknown> }[]>()

/** The readers for a list of formats, built once: the 2D ones asked for, then one reader for every 1D format asked for. */
function readersFor(formats: readonly string[]) {
  const key = formats.join(' ')
  let list = readers.get(key)
  if (!list) {
    const wanted = formats.length ? formats.filter((format) => format in FORMATS) : Object.keys(FORMATS)
    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, wanted.map((format) => FORMATS[format])],
      [DecodeHintType.TRY_HARDER, true],
    ])
    list = MATRIX.filter(([format]) => wanted.includes(format)).map(([, create]) => ({ reader: create(), hints }))
    if (wanted.some((format) => !MATRIX.some(([matrix]) => matrix === format))) list.push({ reader: new MultiFormatOneDReader(hints), hints })
    readers.set(key, list)
  }
  return list
}

/**
 * Reads one code from a picture with `@zxing/library`. Each reader is tried in turn rather than through the
 * library's `MultiFormatReader`, which writes a console warning for every frame without a code.
 */
export const zxingDecoder: BarcodeDecoder = (frame, { formats }) => {
  // The luma (Rec. 601) of each pixel: the library binarizes a greyscale picture.
  const { data } = frame
  const gray = new Uint8ClampedArray(data.length / 4)
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, frame.width, frame.height)))
  const found: BarcodeScanResult[] = []
  for (const { reader, hints } of readersFor(formats)) {
    try {
      const result = reader.decode(bitmap, hints)
      const format = NAMES.get(result.getBarcodeFormat()) ?? String(BarcodeFormat[result.getBarcodeFormat()]).toLowerCase()
      const corners = (result.getResultPoints() ?? []).map((point) => ({ x: point.getX(), y: point.getY() }))
      found.push({ value: result.getText(), format, corners })
      break
    } catch {
      // No code of this reader's formats in the picture.
    } finally {
      reader.reset()
    }
  }
  return found
}
