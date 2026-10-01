/** Axis scale helpers shared by the charts, free of the DOM so they can be tested as plain arithmetic. */

/**
 * A value axis from 0 that ends on a tick: the step is the smallest of 1, 2, 2.5 or 5 times a power of ten that
 * splits `value` into at most three, and the axis ends on the first step at or past it. Handing both to the
 * engine keeps every tick, the last one included, on an even step.
 */
export function niceScale(value: number): { max: number; step: number } {
  if (!(value > 0)) return { max: 1, step: 0.5 }
  const target = value / 3
  const power = 10 ** Math.floor(Math.log10(target))
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= target * (1 - 1e-9)) ?? 10) * power
  return { max: Math.ceil(value / step - 1e-9) * step, step }
}
