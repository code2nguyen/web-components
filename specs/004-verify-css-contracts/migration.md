# Styling property migration

## `c2-color-slider`

| Old property                       | Replacement                                                                                                                                                                                                        | Reason                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--c2-color-slider--borde-leftr`   | `--c2-color-slider--border-left`                                                                                                                                                                                   | The old spelling was documented but never consumed by the gradient's left border. Replace it immediately; there is no compatibility alias. |
| `--c2-color-slider--border-radius` | Four corner properties: `--c2-color-slider--border-top-left-radius`, `--c2-color-slider--border-top-right-radius`, `--c2-color-slider--border-bottom-left-radius`, `--c2-color-slider--border-bottom-right-radius` | The shorthand was documented but never consumed. Use the individual corner controls to retain the intended shape.                          |

These corrections affect the next release containing this feature. Search application styles, theme overrides, presets, and exported configurations for the old names before upgrading.
