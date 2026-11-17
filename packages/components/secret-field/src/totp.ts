/** The HMAC hash of a TOTP secret. Authenticator apps default to `SHA-1`. */
export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface TotpOptions {
  digits: number
  period: number
  algorithm: TotpAlgorithm
}

export interface TotpKey extends TotpOptions {
  key: CryptoKey
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Decodes RFC 4648 base32, ignoring case, spaces, dashes and padding. Throws on any other character. */
export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const char of text.replace(/[\s=-]/g, '').toUpperCase()) {
    const index = BASE32.indexOf(char)
    // The message never quotes the secret.
    if (index < 0) throw new SyntaxError('Invalid base32')
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
      buffer &= (1 << bits) - 1
    }
  }
  return new Uint8Array(bytes)
}

const toAlgorithm = (name: string | null | undefined): TotpAlgorithm | undefined => {
  const value = name?.toUpperCase().replace(/^SHA-?/, 'SHA-')
  return value === 'SHA-1' || value === 'SHA-256' || value === 'SHA-512' ? value : undefined
}

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback

/**
 * Imports a base32 secret, or an `otpauth://totp/…` URI whose `secret`, `digits`, `period` and `algorithm` win over
 * `options`, as a non-extractable HMAC key.
 */
export async function importTotpKey(secret: string, options: TotpOptions): Promise<TotpKey> {
  let { digits, period, algorithm } = options
  if (/^otpauth:/i.test(secret)) {
    if (!/^otpauth:\/\/totp\//i.test(secret)) throw new SyntaxError('Not a TOTP URI')
    const params = new URL(secret).searchParams
    secret = params.get('secret') ?? ''
    digits = Number(params.get('digits') ?? digits)
    period = Number(params.get('period') ?? period)
    algorithm = toAlgorithm(params.get('algorithm') ?? algorithm) ?? algorithm
  }
  const bytes = base32Decode(secret)
  if (!bytes.length) throw new SyntaxError('Empty secret')
  const hash = toAlgorithm(algorithm) ?? 'SHA-1'
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash }, false, ['sign'])
  return { key, digits: clamp(digits, 6, 10, 6), period: clamp(period, 1, 3600, 30), algorithm: hash }
}

/** The RFC 6238 code for time step `counter` (seconds since the epoch divided by the period). */
export async function totpCode({ key, digits }: TotpKey, counter: number): Promise<string> {
  const message = new DataView(new ArrayBuffer(8))
  message.setUint32(0, Math.floor(counter / 2 ** 32))
  message.setUint32(4, counter >>> 0)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = mac[mac.length - 1] & 0xf
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export interface TotpTick {
  step: number
  /** The code of `step`; empty when `step` is the one already shown. */
  code: string
  /** Whether `warn` seconds or fewer are left. */
  warning: boolean
  /** Milliseconds until the warning starts or the next step. */
  wait: number
}

/** The state of the clock at `now`, given the step already shown. */
export async function totpTick(key: TotpKey, shown: number, warn: number, now = Date.now()): Promise<TotpTick> {
  const ms = key.period * 1000
  const step = Math.floor(now / ms)
  const end = (step + 1) * ms
  const warnAt = end - Math.max(0, warn || 0) * 1000
  const warning = now >= warnAt
  return { step, code: step === shown ? '' : await totpCode(key, step), warning, wait: (warning ? end : warnAt) - now }
}
