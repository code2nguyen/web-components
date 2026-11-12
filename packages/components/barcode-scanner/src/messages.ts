import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the scanner when it has no `label`. */
  label: 'Barcode scanner',
  /** The text of the idle screen, before the camera starts. */
  idle: 'Scan a barcode or a QR code with your camera.',
  /** The button that starts the camera. */
  start: 'Start camera',
  /** Read while the browser asks for the camera and opens it. */
  starting: 'Starting the camera…',
  /** Instruction under the scan window. */
  hint: 'Point the camera at a code.',
  /** Read when a code is scanned, with its value. */
  scanned: (value: string) => `Scanned: ${value}`,
  /** The button that starts scanning again after a code was read. */
  scanAgain: 'Scan again',
  /** The button that turns the camera's light on and off. */
  torch: 'Light',
  /** The button that switches between the front and the back camera. */
  switchCamera: 'Switch camera',
  /** Error: the user or the browser refused the camera. */
  errorDenied: 'Camera access was denied. Allow it in the browser settings, then try again.',
  /** Error: no camera was found. */
  errorNotFound: 'No camera was found on this device.',
  /** Error: another application holds the camera. */
  errorBusy: 'The camera is in use by another application.',
  /** Error: the browser cannot use a camera here (no support, or a page not served over HTTPS). */
  errorUnsupported: 'This browser cannot use a camera on this page.',
  /** Error: the camera stopped while open (unplugged, permission revoked). */
  errorEnded: 'The camera stopped. Check that it is connected, then try again.',
  /** Error: no barcode decoder is available (no browser support and no fallback installed). */
  errorDecoder: 'Barcodes cannot be read in this browser.',
  /** Error: any other failure. */
  errorUnknown: 'The camera could not start.',
  /** The button of the error screen that starts the camera again. */
  retry: 'Try again',
}

/** The barcode scanner's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const barcodeScannerMessages = defineMessages('barcode-scanner', en)
