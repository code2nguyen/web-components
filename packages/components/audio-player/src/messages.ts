import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The play button without a `label`. */
  play: 'Play',
  /** The pause button without a `label`. */
  pause: 'Pause',
  /** The play button of a player with a `label`: `{0}` is the label. */
  playLabel: (label: string) => `Play ${label}`,
  /** The pause button of a player with a `label`: `{0}` is the label. */
  pauseLabel: (label: string) => `Pause ${label}`,
  /** The name of the whole player without a `label`. */
  player: 'Audio',
  /** The name of the waveform, which is the seek bar. */
  seek: 'Seek',
  /** The waveform's spoken value: `{0}` is the time played, `{1}` the length. */
  position: (time: string, duration: string) => `${time} of ${duration}`,
  /** The speed button: `{0}` is the speed as shown, such as `1.5×`. */
  speed: (speed: string) => `Playback speed ${speed}`,
  /** The toggle that opens the transcript. */
  showTranscript: 'Show transcript',
  /** The toggle that closes the transcript. */
  hideTranscript: 'Hide transcript',
  /** Shown in place of the time when the recording cannot be played. */
  error: 'Cannot play this recording',
}

/** The audio player's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const audioPlayerMessages = defineMessages('audio-player', en)
