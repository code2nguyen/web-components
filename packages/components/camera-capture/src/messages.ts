import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the component when it has no `label`. */
  label: 'Camera',
  /** The text of the idle screen, before the camera starts. */
  idle: 'Take a photo with your camera.',
  /** The button that starts the camera. */
  start: 'Start camera',
  /** Read while the browser asks for the camera and opens it. */
  starting: 'Starting the camera…',
  /** The shutter button. */
  capture: 'Take photo',
  /** The button that switches between the front and the back camera. */
  switchCamera: 'Switch camera',
  /** The button that throws the photo away and takes another one. */
  retake: 'Retake',
  /** The button that keeps the photo. */
  accept: 'Use photo',
  /** The button on a finished photo that takes it again, with the shot's label. */
  retakeShot: (label: string) => `Retake ${label}`,
  /** Accessible name of the photo under review. */
  preview: 'Photo to review',
  /** Label of a shot that has none, with its position. */
  shot: (index: number) => `Photo ${index}`,
  /** Accessible name of the list of required shots. */
  shots: 'Photos to take',
  /** Read with the shot being taken: its position, the count and its label. */
  progress: (index: number, total: number, label: string) => `Photo ${index} of ${total}: ${label}`,
  /** Read with a shot that is already taken. */
  shotDone: 'taken',
  /** Read once every photo is taken. */
  done: 'All photos taken.',
  /** Instruction under the document guide. */
  guideDocument: 'Fit the document inside the frame.',
  /** Instruction under the card guide. */
  guideCard: 'Fit the card inside the frame.',
  /** Instruction under the face guide. */
  guideFace: 'Centre your face in the oval.',
  /** Quality hint: the picture is too dark. */
  dark: 'More light needed.',
  /** Quality hint: part of the picture is burnt out by a reflection. */
  glare: 'Avoid glare: tilt away from the light.',
  /** Quality hint: the camera or the subject is moving. */
  moving: 'Hold the camera steady.',
  /** Quality hint: the picture is out of focus. */
  blurry: 'The picture is blurry: move closer or wait for focus.',
  /** Read while auto-capture waits for the picture to stay steady. */
  holdStill: 'Hold still…',
  /** Read when a photo is taken. */
  captured: 'Photo taken.',
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
  /** Error: any other failure. */
  errorUnknown: 'The camera could not start.',
  /** The button of the error screen that starts the camera again. */
  retry: 'Try again',
}

/** The camera capture's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const cameraCaptureMessages = defineMessages('camera-capture', en)
