/** Day of the week as `Date#getDay` numbers it: 0 is Sunday, 1 Monday, … 6 Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** The locale a component should use: its own `locale` setting, else the browser's language, else `en-US`. */
export function resolveLocale(locale?: string | null): string {
  if (locale) return locale
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
}

// CLDR regions whose week starts on Sunday or Saturday; every other region starts on Monday. Only used by browsers
// without `Intl.Locale` week info (Firefox before 130).
const SUNDAY_REGIONS = new Set(
  'AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(
    ' ',
  ),
)
const SATURDAY_REGIONS = new Set('AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '))

type WeekInfo = { firstDay: number }
type LocaleWithWeekInfo = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo }

/**
 * First day of the week in `locale`'s convention: Sunday in `en-US`, Monday in `fr` or `en-GB`, Saturday in `ar-EG`.
 * A language without a region (`en`) takes its most likely region (`en-US`).
 */
export function firstDayOfWeek(locale: string): Weekday {
  let intlLocale: LocaleWithWeekInfo
  try {
    intlLocale = new Intl.Locale(locale) as LocaleWithWeekInfo
  } catch {
    return 1
  }
  try {
    // `getWeekInfo()` in current browsers, the older `weekInfo` getter in Safari; ISO numbering, Sunday is 7.
    const info = intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return (info.firstDay % 7) as Weekday
  } catch {
    // Fall through to the region table.
  }
  const region = intlLocale.maximize().region ?? ''
  if (SUNDAY_REGIONS.has(region)) return 0
  if (SATURDAY_REGIONS.has(region)) return 6
  return 1
}
