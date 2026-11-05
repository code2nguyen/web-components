/** A part of a postal address. */
export type AddressPart = 'line1' | 'line2' | 'city' | 'district' | 'region' | 'postalCode'

/** A postal address. `country` is an ISO 3166-1 alpha-2 code; `region` is the code of a listed region, or its text. */
export interface AddressValue {
  line1: string
  line2: string
  city: string
  district: string
  region: string
  postalCode: string
  country: string
}

/** The label of each part, as a message key. */
export type AddressLabel =
  | 'address'
  | 'addressLine1'
  | 'street'
  | 'apartment'
  | 'addressLine2'
  | 'building'
  | 'city'
  | 'town'
  | 'cityWard'
  | 'suburb'
  | 'district'
  | 'neighborhood'
  | 'colonia'
  | 'state'
  | 'province'
  | 'prefecture'
  | 'county'
  | 'emirate'
  | 'region'
  | 'area'
  | 'zip'
  | 'postcode'
  | 'postalCode'
  | 'pin'
  | 'cep'
  | 'eircode'

/** How one country writes an address. */
export interface AddressFormat {
  /** The parts, row by row, in the country's order. */
  rows: AddressPart[][]
  /** The label of each part present. */
  labels: Partial<Record<AddressPart, AddressLabel>>
  /** The parts that must be filled. */
  required: AddressPart[]
  postal?: { pattern: RegExp; example: string }
  /** The regions to pick from, as `[code, name]`; without it the region is typed. */
  regions?: [string, string][]
  /** How the address prints, line by line, with `{part}` placeholders (`{regionName}` is a listed region's name). */
  print: string[]
}

const regionList = (list: string) => list.split('|').map((entry) => entry.split(':') as [string, string])

const US_STATES = regionList(
  'AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|PR:Puerto Rico|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming',
)
const CA_PROVINCES = regionList(
  'AB:Alberta|BC:British Columbia|MB:Manitoba|NB:New Brunswick|NL:Newfoundland and Labrador|NT:Northwest Territories|NS:Nova Scotia|NU:Nunavut|ON:Ontario|PE:Prince Edward Island|QC:Quebec|SK:Saskatchewan|YT:Yukon',
)
const AU_STATES = regionList(
  'ACT:Australian Capital Territory|NSW:New South Wales|NT:Northern Territory|QLD:Queensland|SA:South Australia|TAS:Tasmania|VIC:Victoria|WA:Western Australia',
)
const BR_STATES = regionList(
  'AC:Acre|AL:Alagoas|AP:Amapá|AM:Amazonas|BA:Bahia|CE:Ceará|DF:Distrito Federal|ES:Espírito Santo|GO:Goiás|MA:Maranhão|MT:Mato Grosso|MS:Mato Grosso do Sul|MG:Minas Gerais|PA:Pará|PB:Paraíba|PR:Paraná|PE:Pernambuco|PI:Piauí|RJ:Rio de Janeiro|RN:Rio Grande do Norte|RS:Rio Grande do Sul|RO:Rondônia|RR:Roraima|SC:Santa Catarina|SP:São Paulo|SE:Sergipe|TO:Tocantins',
)
const MX_STATES = regionList(
  'AGU:Aguascalientes|BCN:Baja California|BCS:Baja California Sur|CAM:Campeche|CHP:Chiapas|CHH:Chihuahua|CMX:Ciudad de México|COA:Coahuila|COL:Colima|DUR:Durango|GUA:Guanajuato|GRO:Guerrero|HID:Hidalgo|JAL:Jalisco|MEX:Estado de México|MIC:Michoacán|MOR:Morelos|NAY:Nayarit|NLE:Nuevo León|OAX:Oaxaca|PUE:Puebla|QUE:Querétaro|ROO:Quintana Roo|SLP:San Luis Potosí|SIN:Sinaloa|SON:Sonora|TAB:Tabasco|TAM:Tamaulipas|TLA:Tlaxcala|VER:Veracruz|YUC:Yucatán|ZAC:Zacatecas',
)
const IN_STATES = regionList(
  'AN:Andaman and Nicobar Islands|AP:Andhra Pradesh|AR:Arunachal Pradesh|AS:Assam|BR:Bihar|CH:Chandigarh|CT:Chhattisgarh|DH:Dadra and Nagar Haveli and Daman and Diu|DL:Delhi|GA:Goa|GJ:Gujarat|HR:Haryana|HP:Himachal Pradesh|JK:Jammu and Kashmir|JH:Jharkhand|KA:Karnataka|KL:Kerala|LA:Ladakh|LD:Lakshadweep|MP:Madhya Pradesh|MH:Maharashtra|MN:Manipur|ML:Meghalaya|MZ:Mizoram|NL:Nagaland|OR:Odisha|PY:Puducherry|PB:Punjab|RJ:Rajasthan|SK:Sikkim|TN:Tamil Nadu|TG:Telangana|TR:Tripura|UP:Uttar Pradesh|UT:Uttarakhand|WB:West Bengal',
)
const JP_PREFECTURES = regionList(
  '01:Hokkaido|02:Aomori|03:Iwate|04:Miyagi|05:Akita|06:Yamagata|07:Fukushima|08:Ibaraki|09:Tochigi|10:Gunma|11:Saitama|12:Chiba|13:Tokyo|14:Kanagawa|15:Niigata|16:Toyama|17:Ishikawa|18:Fukui|19:Yamanashi|20:Nagano|21:Gifu|22:Shizuoka|23:Aichi|24:Mie|25:Shiga|26:Kyoto|27:Osaka|28:Hyogo|29:Nara|30:Wakayama|31:Tottori|32:Shimane|33:Okayama|34:Hiroshima|35:Yamaguchi|36:Tokushima|37:Kagawa|38:Ehime|39:Kochi|40:Fukuoka|41:Saga|42:Nagasaki|43:Kumamoto|44:Oita|45:Miyazaki|46:Kagoshima|47:Okinawa',
)
const AE_EMIRATES = regionList('AZ:Abu Dhabi|AJ:Ajman|DU:Dubai|FU:Fujairah|RK:Ras al-Khaimah|SH:Sharjah|UQ:Umm al-Quwain')

const postal = (pattern: RegExp, example: string) => ({ pattern, example })

// The usual European shape: street, extra line, postal code then city.
const europe = (code: RegExp, example: string, extra: Partial<AddressFormat> = {}): AddressFormat => ({
  rows: [['line1'], ['line2'], ['postalCode', 'city']],
  labels: { line1: 'address', line2: 'apartment', city: 'city', postalCode: 'postalCode' },
  required: ['line1', 'city', 'postalCode'],
  postal: postal(code, example),
  print: ['{line1}', '{line2}', '{postalCode} {city}', '{country}'],
  ...extra,
})

// The North American shape: city, region and postal code on one line.
const american = (
  labels: Partial<Record<AddressPart, AddressLabel>>,
  regions: [string, string][] | undefined,
  code: RegExp,
  example: string,
  print: string,
): AddressFormat => ({
  rows: [['line1'], ['line2'], ['city', 'region', 'postalCode']],
  labels: { line1: 'address', line2: 'apartment', city: 'city', ...labels },
  required: ['line1', 'city', 'region', 'postalCode'],
  postal: postal(code, example),
  regions,
  print: ['{line1}', '{line2}', print, '{country}'],
})

/** Address formats by country code. */
export const ADDRESS_FORMATS: Record<string, AddressFormat> = {
  US: american({ region: 'state', postalCode: 'zip' }, US_STATES, /^\d{5}(-\d{4})?$/, '94103', '{city}, {region} {postalCode}'),
  CA: american(
    { region: 'province', postalCode: 'postalCode' },
    CA_PROVINCES,
    /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
    'K1A 0B1',
    '{city} {region} {postalCode}',
  ),
  AU: american({ city: 'suburb', region: 'state', postalCode: 'postcode' }, AU_STATES, /^\d{4}$/, '2000', '{city} {region} {postalCode}'),
  NZ: {
    rows: [['line1'], ['line2'], ['city', 'postalCode']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', postalCode: 'postcode' },
    required: ['line1', 'city', 'postalCode'],
    postal: postal(/^\d{4}$/, '6011'),
    print: ['{line1}', '{line2}', '{city} {postalCode}', '{country}'],
  },
  GB: {
    rows: [['line1'], ['line2'], ['city', 'region'], ['postalCode']],
    labels: { line1: 'addressLine1', line2: 'addressLine2', city: 'town', region: 'county', postalCode: 'postcode' },
    required: ['line1', 'city', 'postalCode'],
    postal: postal(/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/, 'SW1A 2AA'),
    print: ['{line1}', '{line2}', '{city}', '{region}', '{postalCode}', '{country}'],
  },
  IE: {
    rows: [['line1'], ['line2'], ['city', 'region'], ['postalCode']],
    labels: { line1: 'addressLine1', line2: 'addressLine2', city: 'town', region: 'county', postalCode: 'eircode' },
    required: ['line1', 'city'],
    postal: postal(/^[A-Za-z]\d[\dWw]\s?[A-Za-z\d]{4}$/, 'D02 X285'),
    print: ['{line1}', '{line2}', '{city}', '{region}', '{postalCode}', '{country}'],
  },
  DE: europe(/^\d{5}$/, '10115'),
  FR: europe(/^\d{5}$/, '75004'),
  ES: europe(/^\d{5}$/, '28013', {
    rows: [['line1'], ['line2'], ['postalCode', 'city', 'region']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'province', postalCode: 'postalCode' },
    print: ['{line1}', '{line2}', '{postalCode} {city}', '{region}', '{country}'],
  }),
  IT: europe(/^\d{5}$/, '00184', {
    rows: [['line1'], ['line2'], ['postalCode', 'city', 'region']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'province', postalCode: 'postalCode' },
    print: ['{line1}', '{line2}', '{postalCode} {city} {region}', '{country}'],
  }),
  PT: europe(/^\d{4}-\d{3}$/, '1100-148'),
  NL: europe(/^\d{4}\s?[A-Za-z]{2}$/, '1012 JS'),
  BE: europe(/^\d{4}$/, '1000'),
  LU: europe(/^(L-)?\d{4}$/, '1009'),
  CH: europe(/^\d{4}$/, '8001'),
  AT: europe(/^\d{4}$/, '1010'),
  DK: europe(/^\d{4}$/, '1050'),
  SE: europe(/^\d{3}\s?\d{2}$/, '111 22'),
  NO: europe(/^\d{4}$/, '0150'),
  FI: europe(/^\d{5}$/, '00100'),
  PL: europe(/^\d{2}-\d{3}$/, '00-950'),
  CZ: europe(/^\d{3}\s?\d{2}$/, '110 00'),
  GR: europe(/^\d{3}\s?\d{2}$/, '105 57'),
  IL: europe(/^\d{7}$/, '9614303'),
  TR: europe(/^\d{5}$/, '34000'),
  ZA: europe(/^\d{4}$/, '2001', { print: ['{line1}', '{line2}', '{city}', '{postalCode}', '{country}'] }),
  CL: europe(/^\d{7}$/, '8320000', { required: ['line1', 'city'] }),
  CO: europe(/^\d{6}$/, '110111', { required: ['line1', 'city'] }),
  AR: europe(/^([A-Za-z]\d{4}[A-Za-z]{3}|\d{4})$/, 'C1002AAB', {
    rows: [['line1'], ['line2'], ['postalCode', 'city'], ['region']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'province', postalCode: 'postalCode' },
    print: ['{line1}', '{line2}', '{postalCode} {city}', '{region}', '{country}'],
  }),
  JP: {
    rows: [['postalCode', 'region'], ['city'], ['line1'], ['line2']],
    labels: { postalCode: 'postalCode', region: 'prefecture', city: 'cityWard', line1: 'street', line2: 'building' },
    required: ['postalCode', 'region', 'city', 'line1'],
    postal: postal(/^\d{3}-?\d{4}$/, '150-0002'),
    regions: JP_PREFECTURES,
    print: ['{line1}', '{line2}', '{city}, {regionName} {postalCode}', '{country}'],
  },
  CN: {
    rows: [['region', 'city'], ['district'], ['line1'], ['line2'], ['postalCode']],
    labels: { region: 'province', city: 'city', district: 'district', line1: 'address', line2: 'apartment', postalCode: 'postalCode' },
    required: ['region', 'city', 'line1'],
    postal: postal(/^\d{6}$/, '100000'),
    print: ['{line1}', '{line2}', '{district}', '{city}, {region} {postalCode}', '{country}'],
  },
  KR: {
    rows: [['line1'], ['line2'], ['city', 'region'], ['postalCode']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'province', postalCode: 'postalCode' },
    required: ['line1', 'city', 'postalCode'],
    postal: postal(/^\d{5}$/, '03187'),
    print: ['{line1}', '{line2}', '{city}, {region} {postalCode}', '{country}'],
  },
  IN: {
    rows: [['line1'], ['line2'], ['city', 'region'], ['postalCode']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'state', postalCode: 'pin' },
    required: ['line1', 'city', 'region', 'postalCode'],
    postal: postal(/^\d{6}$/, '110001'),
    regions: IN_STATES,
    print: ['{line1}', '{line2}', '{city} {postalCode}', '{regionName}', '{country}'],
  },
  SG: {
    rows: [['line1'], ['line2'], ['postalCode']],
    labels: { line1: 'address', line2: 'apartment', postalCode: 'postalCode' },
    required: ['line1', 'postalCode'],
    postal: postal(/^\d{6}$/, '018956'),
    print: ['{line1}', '{line2}', 'Singapore {postalCode}', '{country}'],
  },
  HK: {
    rows: [['line1'], ['line2'], ['district'], ['region']],
    labels: { line1: 'address', line2: 'apartment', district: 'district', region: 'area' },
    required: ['line1', 'district'],
    print: ['{line1}', '{line2}', '{district}', '{region}', '{country}'],
  },
  MY: {
    rows: [['line1'], ['line2'], ['postalCode', 'city'], ['region']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'state', postalCode: 'postcode' },
    required: ['line1', 'city', 'region', 'postalCode'],
    postal: postal(/^\d{5}$/, '50450'),
    print: ['{line1}', '{line2}', '{postalCode} {city}', '{region}', '{country}'],
  },
  TH: {
    rows: [['line1'], ['line2'], ['district', 'region'], ['postalCode']],
    labels: { line1: 'address', line2: 'apartment', district: 'district', region: 'province', postalCode: 'postalCode' },
    required: ['line1', 'region', 'postalCode'],
    postal: postal(/^\d{5}$/, '10200'),
    print: ['{line1}', '{line2}', '{district}', '{region} {postalCode}', '{country}'],
  },
  PH: american({ region: 'province', postalCode: 'postalCode' }, undefined, /^\d{4}$/, '1000', '{city} {postalCode} {region}'),
  ID: american({ region: 'province', postalCode: 'postalCode' }, undefined, /^\d{5}$/, '10110', '{city} {postalCode}'),
  BR: {
    rows: [['postalCode'], ['line1'], ['line2'], ['district'], ['city', 'region']],
    labels: { postalCode: 'cep', line1: 'address', line2: 'apartment', district: 'neighborhood', city: 'city', region: 'state' },
    required: ['postalCode', 'line1', 'city', 'region'],
    postal: postal(/^\d{5}-?\d{3}$/, '01310-100'),
    regions: BR_STATES,
    print: ['{line1}', '{line2}', '{district}', '{city} - {region}', '{postalCode}', '{country}'],
  },
  MX: {
    rows: [['line1'], ['line2'], ['district'], ['postalCode', 'city'], ['region']],
    labels: { line1: 'address', line2: 'apartment', district: 'colonia', city: 'city', region: 'state', postalCode: 'postalCode' },
    required: ['line1', 'city', 'region', 'postalCode'],
    postal: postal(/^\d{5}$/, '06600'),
    regions: MX_STATES,
    print: ['{line1}', '{line2}', '{district}', '{postalCode} {city}, {regionName}', '{country}'],
  },
  AE: {
    rows: [['line1'], ['line2'], ['city', 'region']],
    labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'emirate' },
    required: ['line1', 'city', 'region'],
    regions: AE_EMIRATES,
    print: ['{line1}', '{line2}', '{city}', '{regionName}', '{country}'],
  },
}

/** The format of a country without one of its own. */
export const GENERIC_FORMAT: AddressFormat = {
  rows: [['line1'], ['line2'], ['city', 'region'], ['postalCode']],
  labels: { line1: 'address', line2: 'apartment', city: 'city', region: 'region', postalCode: 'postalCode' },
  required: ['line1', 'city'],
  print: ['{line1}', '{line2}', '{city} {region} {postalCode}', '{country}'],
}

/** The format for a country code. */
export function addressFormat(country: string): AddressFormat {
  return ADDRESS_FORMATS[(country || '').toUpperCase()] ?? GENERIC_FORMAT
}

/** The parts a country's format uses. */
export function addressParts(country: string): AddressPart[] {
  return addressFormat(country).rows.flat()
}

/** A region's code from its code or its name, for an address coming from a provider. */
export function regionCode(country: string, region: string): string {
  const regions = addressFormat(country).regions
  if (!regions || !region) return region
  const wanted = region.trim().toLowerCase()
  const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const match = regions.find(([code, name]) => code.toLowerCase() === wanted || name.toLowerCase() === wanted || folded(name) === folded(region))
  return match ? match[0] : region
}

/** A region's name from its code, else the text as it is. */
export function regionName(country: string, region: string): string {
  return addressFormat(country).regions?.find(([code]) => code === region)?.[1] ?? region
}

/**
 * An address as the lines a label or a letter shows, in the country's postal order, with the country's name in
 * `locale` (left out with `country: false`). Empty parts and empty lines are dropped.
 */
export function formatAddress(value: Partial<AddressValue>, options: { locale?: string; country?: boolean } = {}): string[] {
  const country = (value.country ?? '').toUpperCase()
  const format = addressFormat(country)
  let countryName = country
  try {
    if (country) countryName = new Intl.DisplayNames(options.locale ? [options.locale] : undefined, { type: 'region' }).of(country) ?? country
  } catch {
    // An unknown code prints as it is.
  }
  const parts: Record<string, string> = {
    line1: value.line1 ?? '',
    line2: value.line2 ?? '',
    city: value.city ?? '',
    district: value.district ?? '',
    region: value.region ?? '',
    regionName: regionName(country, value.region ?? ''),
    postalCode: value.postalCode ?? '',
    country: options.country === false ? '' : countryName,
  }
  return format.print
    .map((line) =>
      line
        .replace(/\{(\w+)\}/g, (_match, name: string) => parts[name] ?? '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,-]+|[\s,-]+$/g, '')
        .replace(/\s+,/g, ','),
    )
    .filter((line) => line.length > 0)
}
