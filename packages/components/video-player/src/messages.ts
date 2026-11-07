import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The player's accessible name when it has no `label`. */
  player: 'Video player',
  /** The play button. */
  play: 'Play',
  /** The pause button. */
  pause: 'Pause',
  /** The big button over the poster before the first play: `{0}` is the video's label. */
  playVideo: (label: string) => (label ? `Play ${label}` : 'Play video'),
  /** The mute button. */
  mute: 'Mute',
  /** The unmute button. */
  unmute: 'Unmute',
  /** The volume slider. */
  volume: 'Volume',
  /** The seek slider. */
  seek: 'Seek',
  /** The seek slider's value: `{0}` is the time, `{1}` the duration. */
  timeOf: (time: string, duration: string) => `${time} of ${duration}`,
  /** The seek slider's value inside a chapter: `{0}` is the time, `{1}` the duration, `{2}` the chapter's title. */
  timeOfInChapter: (time: string, duration: string, chapter: string) => `${time} of ${duration}, ${chapter}`,
  /** The captions button while captions are off: `{0}` names the track turned on. */
  captionsOn: (track: string) => `Turn on captions: ${track}`,
  /** The captions button while captions show: `{0}` is the track shown. */
  captionsOff: (track: string) => `Turn off captions: ${track}`,
  /** The settings button that opens the speed and captions menu. */
  settings: 'Settings',
  /** The menu's group of playback speeds. */
  speed: 'Speed',
  /** A playback speed in the menu: `{0}` is the rate. */
  rate: (rate: string) => `${rate}×`,
  /** The normal playback speed. */
  normalRate: 'Normal',
  /** The menu's group of caption tracks. */
  captions: 'Captions',
  /** The menu row that turns captions off. */
  off: 'Off',
  /** The picture-in-picture button. */
  pip: 'Picture in picture',
  /** The picture-in-picture button while it is on. */
  exitPip: 'Exit picture in picture',
  /** The full-screen button. */
  fullscreen: 'Full screen',
  /** The full-screen button while full screen. */
  exitFullscreen: 'Exit full screen',
  /** Shown and announced while the video waits for data. */
  loading: 'Loading',
  /** The heading of the error panel. */
  error: 'The video can’t be played',
  /** Why it failed, from `MediaError.code`. */
  errorAborted: 'Loading was stopped.',
  errorNetwork: 'A network error stopped the download.',
  errorDecode: 'The video is damaged or in a format this browser can’t play.',
  errorSource: 'The video was not found, or its format is not supported.',
  /** The error panel's button. */
  retry: 'Try again',
  /** Announced when the speed changes: `{0}` is the rate. */
  speedChanged: (rate: string) => `Speed ${rate}`,
  /** Announced when captions change: `{0}` is the track, or "Off". */
  captionsChanged: (track: string) => `Captions: ${track}`,
}

/** The video player's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const videoPlayerMessages = defineMessages('video-player', en)
