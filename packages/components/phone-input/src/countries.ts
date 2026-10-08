/** One country or territory of the picker. */
export interface PhoneCountry {
  /** ISO 3166-1 alpha-2 code, upper case (`FR`). */
  iso: string
  /** Country calling code without the plus (`33`). */
  dialCode: string
  /**
   * For countries that share a calling code, the leading digits of the national number that identify them
   * (`242` for the Bahamas inside +1). The country listed first for a code without area codes is the main one.
   */
  areaCodes?: string[]
  /** Digit dialled before a national number inside the country and dropped in E.164 (`0` in France, `1` in the US). */
  trunk?: string
  /** Allowed lengths of the national significant number (without the trunk prefix). Unknown: E.164's 4 to 14. */
  lengths?: number[]
  /** Display grouping of the national significant number: `#` is a digit, anything else is copied. */
  format?: string
  /** An example national significant number, shown formatted as the placeholder. */
  example?: string
}

// Calling codes, trunk prefixes, lengths and groupings follow the ITU-T E.164 assignments and the national numbering
// plans as recorded in libphonenumber's metadata. Countries without a grouping are shown in groups of three or four.
const NANP = { dialCode: '1', trunk: '1', lengths: [10], format: '(###) ###-####' }

// prettier-ignore
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: 'US', ...NANP, example: '2015550123' },
  { iso: 'CA', ...NANP, example: '5062345678', areaCodes: ['204', '226', '236', '249', '250', '263', '289', '306', '343', '354', '365', '367', '368', '382', '403', '416', '418', '428', '431', '437', '438', '450', '468', '474', '506', '514', '519', '548', '579', '581', '584', '587', '604', '613', '639', '647', '672', '683', '705', '709', '742', '753', '778', '780', '782', '807', '819', '825', '867', '873', '879', '902', '905'] },
  { iso: 'AG', ...NANP, areaCodes: ['268'] },
  { iso: 'AI', ...NANP, areaCodes: ['264'] },
  { iso: 'AS', ...NANP, areaCodes: ['684'] },
  { iso: 'BB', ...NANP, areaCodes: ['246'] },
  { iso: 'BM', ...NANP, areaCodes: ['441'] },
  { iso: 'BS', ...NANP, areaCodes: ['242'] },
  { iso: 'DM', ...NANP, areaCodes: ['767'] },
  { iso: 'DO', ...NANP, areaCodes: ['809', '829', '849'] },
  { iso: 'GD', ...NANP, areaCodes: ['473'] },
  { iso: 'GU', ...NANP, areaCodes: ['671'] },
  { iso: 'JM', ...NANP, areaCodes: ['658', '876'] },
  { iso: 'KN', ...NANP, areaCodes: ['869'] },
  { iso: 'KY', ...NANP, areaCodes: ['345'] },
  { iso: 'LC', ...NANP, areaCodes: ['758'] },
  { iso: 'MP', ...NANP, areaCodes: ['670'] },
  { iso: 'MS', ...NANP, areaCodes: ['664'] },
  { iso: 'PR', ...NANP, areaCodes: ['787', '939'] },
  { iso: 'SX', ...NANP, areaCodes: ['721'] },
  { iso: 'TC', ...NANP, areaCodes: ['649'] },
  { iso: 'TT', ...NANP, areaCodes: ['868'] },
  { iso: 'VC', ...NANP, areaCodes: ['784'] },
  { iso: 'VG', ...NANP, areaCodes: ['284'] },
  { iso: 'VI', ...NANP, areaCodes: ['340'] },
  { iso: 'RU', dialCode: '7', trunk: '8', lengths: [10], format: '### ###-##-##', example: '9123456789' },
  { iso: 'KZ', dialCode: '7', trunk: '8', lengths: [10], format: '### ### ## ##', example: '7710009998', areaCodes: ['6', '7'] },
  { iso: 'EG', dialCode: '20', trunk: '0', lengths: [8, 9, 10], example: '1001234567' },
  { iso: 'ZA', dialCode: '27', trunk: '0', lengths: [9], format: '## ### ####', example: '711234567' },
  { iso: 'GR', dialCode: '30', lengths: [10], format: '### ### ####', example: '6912345678' },
  { iso: 'NL', dialCode: '31', trunk: '0', lengths: [9], format: '# ########', example: '612345678' },
  { iso: 'BE', dialCode: '32', trunk: '0', lengths: [8, 9], format: '### ## ## ##', example: '470123456' },
  { iso: 'FR', dialCode: '33', trunk: '0', lengths: [9], format: '# ## ## ## ##', example: '612345678' },
  { iso: 'ES', dialCode: '34', lengths: [9], format: '### ## ## ##', example: '612345678' },
  { iso: 'HU', dialCode: '36', trunk: '06', lengths: [8, 9], format: '## ### ####', example: '201234567' },
  { iso: 'IT', dialCode: '39', lengths: [6, 7, 8, 9, 10, 11], format: '### ### ####', example: '3123456789' },
  { iso: 'VA', dialCode: '39', areaCodes: ['06698'], lengths: [6, 7, 8, 9, 10, 11] },
  { iso: 'RO', dialCode: '40', trunk: '0', lengths: [9], format: '### ### ###', example: '712034567' },
  { iso: 'CH', dialCode: '41', trunk: '0', lengths: [9], format: '## ### ## ##', example: '781234567' },
  { iso: 'AT', dialCode: '43', trunk: '0', lengths: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13], example: '664123456' },
  { iso: 'GB', dialCode: '44', trunk: '0', lengths: [9, 10], format: '#### ######', example: '7400123456' },
  { iso: 'GG', dialCode: '44', trunk: '0', lengths: [10], format: '#### ######', areaCodes: ['1481', '7781', '7839', '7911'] },
  { iso: 'IM', dialCode: '44', trunk: '0', lengths: [10], format: '#### ######', areaCodes: ['1624', '74576', '7524', '7924', '7624'] },
  { iso: 'JE', dialCode: '44', trunk: '0', lengths: [10], format: '#### ######', areaCodes: ['1534', '7509', '7700', '7797', '7829', '7937'] },
  { iso: 'DK', dialCode: '45', lengths: [8], format: '## ## ## ##', example: '32123456' },
  { iso: 'SE', dialCode: '46', trunk: '0', lengths: [7, 8, 9, 10], format: '## ### ## ##', example: '701234567' },
  { iso: 'NO', dialCode: '47', lengths: [8], format: '### ## ###', example: '40612345' },
  { iso: 'SJ', dialCode: '47', lengths: [8], format: '### ## ###', areaCodes: ['79'] },
  { iso: 'PL', dialCode: '48', lengths: [9], format: '### ### ###', example: '512345678' },
  { iso: 'DE', dialCode: '49', trunk: '0', lengths: [6, 7, 8, 9, 10, 11, 12, 13], format: '#### #######', example: '15123456789' },
  { iso: 'PE', dialCode: '51', trunk: '0', lengths: [8, 9], format: '### ### ###', example: '912345678' },
  { iso: 'MX', dialCode: '52', lengths: [10], format: '## #### ####', example: '2221234567' },
  { iso: 'CU', dialCode: '53', trunk: '0', lengths: [8], example: '51234567' },
  { iso: 'AR', dialCode: '54', trunk: '0', lengths: [10, 11], format: '## ####-####', example: '1123456789' },
  { iso: 'BR', dialCode: '55', trunk: '0', lengths: [10, 11], format: '(##) #####-####', example: '11961234567' },
  { iso: 'CL', dialCode: '56', lengths: [9], format: '# #### ####', example: '221234567' },
  { iso: 'CO', dialCode: '57', trunk: '0', lengths: [10], format: '### #######', example: '3211234567' },
  { iso: 'VE', dialCode: '58', trunk: '0', lengths: [10], format: '###-#######', example: '4121234567' },
  { iso: 'MY', dialCode: '60', trunk: '0', lengths: [9, 10], format: '##-### ####', example: '123456789' },
  { iso: 'AU', dialCode: '61', trunk: '0', lengths: [9], format: '### ### ###', example: '412345678' },
  { iso: 'CC', dialCode: '61', trunk: '0', lengths: [9], areaCodes: ['89162'] },
  { iso: 'CX', dialCode: '61', trunk: '0', lengths: [9], areaCodes: ['89164'] },
  { iso: 'ID', dialCode: '62', trunk: '0', lengths: [9, 10, 11, 12], format: '###-####-####', example: '812345678' },
  { iso: 'PH', dialCode: '63', trunk: '0', lengths: [10], format: '### ### ####', example: '9051234567' },
  { iso: 'NZ', dialCode: '64', trunk: '0', lengths: [8, 9, 10], format: '## ### ####', example: '211234567' },
  { iso: 'SG', dialCode: '65', lengths: [8], format: '#### ####', example: '81234567' },
  { iso: 'TH', dialCode: '66', trunk: '0', lengths: [8, 9], format: '## ### ####', example: '812345678' },
  { iso: 'JP', dialCode: '81', trunk: '0', lengths: [9, 10], format: '##-####-####', example: '9012345678' },
  { iso: 'KR', dialCode: '82', trunk: '0', lengths: [9, 10], format: '##-####-####', example: '1020000000' },
  { iso: 'VN', dialCode: '84', trunk: '0', lengths: [9, 10], format: '### ### ###', example: '912345678' },
  { iso: 'CN', dialCode: '86', trunk: '0', lengths: [10, 11], format: '### #### ####', example: '13123456789' },
  { iso: 'TR', dialCode: '90', trunk: '0', lengths: [10], format: '### ### ## ##', example: '5012345678' },
  { iso: 'IN', dialCode: '91', trunk: '0', lengths: [10], format: '##### #####', example: '8123456789' },
  { iso: 'PK', dialCode: '92', trunk: '0', lengths: [9, 10], format: '### #######', example: '3012345678' },
  { iso: 'AF', dialCode: '93', trunk: '0', lengths: [9], format: '## ### ####', example: '701234567' },
  { iso: 'LK', dialCode: '94', trunk: '0', lengths: [9], format: '## ### ####', example: '712345678' },
  { iso: 'MM', dialCode: '95', trunk: '0', lengths: [7, 8, 9, 10] },
  { iso: 'IR', dialCode: '98', trunk: '0', lengths: [10], format: '### ### ####', example: '9123456789' },
  { iso: 'SS', dialCode: '211', trunk: '0', lengths: [9] },
  { iso: 'MA', dialCode: '212', trunk: '0', lengths: [9], format: '###-######', example: '650123456' },
  { iso: 'EH', dialCode: '212', trunk: '0', lengths: [9], areaCodes: ['528', '6', '7'] },
  { iso: 'DZ', dialCode: '213', trunk: '0', lengths: [8, 9], format: '### ## ## ##', example: '551234567' },
  { iso: 'TN', dialCode: '216', lengths: [8], format: '## ### ###', example: '20123456' },
  { iso: 'LY', dialCode: '218', trunk: '0', lengths: [9] },
  { iso: 'GM', dialCode: '220', lengths: [7] },
  { iso: 'SN', dialCode: '221', lengths: [9], format: '## ### ## ##', example: '701234567' },
  { iso: 'MR', dialCode: '222', lengths: [8] },
  { iso: 'ML', dialCode: '223', lengths: [8] },
  { iso: 'GN', dialCode: '224', lengths: [9] },
  { iso: 'CI', dialCode: '225', lengths: [10], format: '## ## ## ####', example: '0123456789' },
  { iso: 'BF', dialCode: '226', lengths: [8] },
  { iso: 'NE', dialCode: '227', lengths: [8] },
  { iso: 'TG', dialCode: '228', lengths: [8] },
  { iso: 'BJ', dialCode: '229', lengths: [8, 10] },
  { iso: 'MU', dialCode: '230', lengths: [7, 8] },
  { iso: 'LR', dialCode: '231', trunk: '0', lengths: [7, 8, 9] },
  { iso: 'SL', dialCode: '232', trunk: '0', lengths: [8] },
  { iso: 'GH', dialCode: '233', trunk: '0', lengths: [9], format: '## ### ####', example: '231234567' },
  { iso: 'NG', dialCode: '234', trunk: '0', lengths: [8, 10], format: '### ### ####', example: '8021234567' },
  { iso: 'TD', dialCode: '235', lengths: [8] },
  { iso: 'CF', dialCode: '236', lengths: [8] },
  { iso: 'CM', dialCode: '237', lengths: [8, 9] },
  { iso: 'CV', dialCode: '238', lengths: [7] },
  { iso: 'ST', dialCode: '239', lengths: [7] },
  { iso: 'GQ', dialCode: '240', lengths: [9] },
  { iso: 'GA', dialCode: '241', trunk: '0', lengths: [7, 8] },
  { iso: 'CG', dialCode: '242', lengths: [9] },
  { iso: 'CD', dialCode: '243', trunk: '0', lengths: [7, 9] },
  { iso: 'AO', dialCode: '244', lengths: [9] },
  { iso: 'GW', dialCode: '245', lengths: [7, 9] },
  { iso: 'IO', dialCode: '246', lengths: [7] },
  { iso: 'SC', dialCode: '248', lengths: [7] },
  { iso: 'SD', dialCode: '249', trunk: '0', lengths: [9] },
  { iso: 'RW', dialCode: '250', trunk: '0', lengths: [9] },
  { iso: 'ET', dialCode: '251', trunk: '0', lengths: [9] },
  { iso: 'SO', dialCode: '252', trunk: '0', lengths: [7, 8, 9] },
  { iso: 'DJ', dialCode: '253', lengths: [8] },
  { iso: 'KE', dialCode: '254', trunk: '0', lengths: [9, 10], format: '### ######', example: '712123456' },
  { iso: 'TZ', dialCode: '255', trunk: '0', lengths: [9], format: '### ### ###', example: '621234567' },
  { iso: 'UG', dialCode: '256', trunk: '0', lengths: [9], format: '### ######', example: '712345678' },
  { iso: 'BI', dialCode: '257', lengths: [8] },
  { iso: 'MZ', dialCode: '258', lengths: [8, 9] },
  { iso: 'ZM', dialCode: '260', trunk: '0', lengths: [9] },
  { iso: 'MG', dialCode: '261', trunk: '0', lengths: [9] },
  { iso: 'RE', dialCode: '262', trunk: '0', lengths: [9], format: '### ## ## ##', example: '692123456' },
  { iso: 'YT', dialCode: '262', trunk: '0', lengths: [9], format: '### ## ## ##', areaCodes: ['269', '639', '80'] },
  { iso: 'ZW', dialCode: '263', trunk: '0', lengths: [5, 6, 7, 8, 9, 10] },
  { iso: 'NA', dialCode: '264', trunk: '0', lengths: [8, 9] },
  { iso: 'MW', dialCode: '265', trunk: '0', lengths: [7, 9] },
  { iso: 'LS', dialCode: '266', lengths: [8] },
  { iso: 'BW', dialCode: '267', lengths: [7, 8] },
  { iso: 'SZ', dialCode: '268', lengths: [8] },
  { iso: 'KM', dialCode: '269', lengths: [7] },
  { iso: 'SH', dialCode: '290', lengths: [4, 5] },
  { iso: 'ER', dialCode: '291', trunk: '0', lengths: [7] },
  { iso: 'AW', dialCode: '297', lengths: [7] },
  { iso: 'FO', dialCode: '298', lengths: [6] },
  { iso: 'GL', dialCode: '299', lengths: [6] },
  { iso: 'GI', dialCode: '350', lengths: [8] },
  { iso: 'PT', dialCode: '351', lengths: [9], format: '### ### ###', example: '912345678' },
  { iso: 'LU', dialCode: '352', lengths: [4, 5, 6, 7, 8, 9, 10, 11] },
  { iso: 'IE', dialCode: '353', trunk: '0', lengths: [7, 8, 9], format: '## ### ####', example: '850123456' },
  { iso: 'IS', dialCode: '354', lengths: [7, 9], format: '### ####', example: '6111234' },
  { iso: 'AL', dialCode: '355', trunk: '0', lengths: [6, 7, 8, 9] },
  { iso: 'MT', dialCode: '356', lengths: [8], format: '#### ####', example: '96961234' },
  { iso: 'CY', dialCode: '357', lengths: [8], format: '## ######', example: '96123456' },
  { iso: 'FI', dialCode: '358', trunk: '0', lengths: [5, 6, 7, 8, 9, 10, 11, 12], format: '## ### ####', example: '412345678' },
  { iso: 'AX', dialCode: '358', trunk: '0', lengths: [5, 6, 7, 8, 9, 10, 11, 12], areaCodes: ['18'] },
  { iso: 'BG', dialCode: '359', trunk: '0', lengths: [6, 7, 8, 9], format: '### ### ###', example: '871234567' },
  { iso: 'LT', dialCode: '370', trunk: '8', lengths: [8], format: '### #####', example: '61234567' },
  { iso: 'LV', dialCode: '371', lengths: [8], format: '## ### ###', example: '21234567' },
  { iso: 'EE', dialCode: '372', lengths: [7, 8], format: '#### ####', example: '51234567' },
  { iso: 'MD', dialCode: '373', trunk: '0', lengths: [8] },
  { iso: 'AM', dialCode: '374', trunk: '0', lengths: [8] },
  { iso: 'BY', dialCode: '375', trunk: '8', lengths: [9] },
  { iso: 'AD', dialCode: '376', lengths: [6, 8, 9] },
  { iso: 'MC', dialCode: '377', trunk: '0', lengths: [8, 9] },
  { iso: 'SM', dialCode: '378', lengths: [6, 8, 9, 10] },
  { iso: 'UA', dialCode: '380', trunk: '0', lengths: [9], format: '## ### ####', example: '501234567' },
  { iso: 'RS', dialCode: '381', trunk: '0', lengths: [7, 8, 9, 10, 11, 12] },
  { iso: 'ME', dialCode: '382', trunk: '0', lengths: [8] },
  { iso: 'XK', dialCode: '383', trunk: '0', lengths: [8, 9] },
  { iso: 'HR', dialCode: '385', trunk: '0', lengths: [8, 9], format: '## ### ####', example: '921234567' },
  { iso: 'SI', dialCode: '386', trunk: '0', lengths: [8], format: '## ### ###', example: '31234567' },
  { iso: 'BA', dialCode: '387', trunk: '0', lengths: [8, 9] },
  { iso: 'MK', dialCode: '389', trunk: '0', lengths: [8] },
  { iso: 'CZ', dialCode: '420', lengths: [9], format: '### ### ###', example: '601123456' },
  { iso: 'SK', dialCode: '421', trunk: '0', lengths: [9], format: '### ### ###', example: '912123456' },
  { iso: 'LI', dialCode: '423', trunk: '0', lengths: [7, 9] },
  { iso: 'FK', dialCode: '500', lengths: [5] },
  { iso: 'BZ', dialCode: '501', lengths: [7] },
  { iso: 'GT', dialCode: '502', lengths: [8], format: '#### ####', example: '51234567' },
  { iso: 'SV', dialCode: '503', lengths: [8] },
  { iso: 'HN', dialCode: '504', lengths: [8] },
  { iso: 'NI', dialCode: '505', lengths: [8] },
  { iso: 'CR', dialCode: '506', lengths: [8], format: '#### ####', example: '83123456' },
  { iso: 'PA', dialCode: '507', lengths: [7, 8] },
  { iso: 'PM', dialCode: '508', trunk: '0', lengths: [6] },
  { iso: 'HT', dialCode: '509', lengths: [8] },
  { iso: 'GP', dialCode: '590', trunk: '0', lengths: [9] },
  { iso: 'BL', dialCode: '590', trunk: '0', lengths: [9], areaCodes: ['590276'] },
  { iso: 'MF', dialCode: '590', trunk: '0', lengths: [9], areaCodes: ['590870'] },
  { iso: 'BO', dialCode: '591', trunk: '0', lengths: [8] },
  { iso: 'GY', dialCode: '592', lengths: [7] },
  { iso: 'EC', dialCode: '593', trunk: '0', lengths: [8, 9] },
  { iso: 'GF', dialCode: '594', trunk: '0', lengths: [9] },
  { iso: 'PY', dialCode: '595', trunk: '0', lengths: [9] },
  { iso: 'MQ', dialCode: '596', trunk: '0', lengths: [9] },
  { iso: 'SR', dialCode: '597', lengths: [6, 7] },
  { iso: 'UY', dialCode: '598', trunk: '0', lengths: [8] },
  { iso: 'CW', dialCode: '599', lengths: [7, 8] },
  { iso: 'BQ', dialCode: '599', lengths: [7], areaCodes: ['3', '4', '7'] },
  { iso: 'TL', dialCode: '670', lengths: [7, 8] },
  { iso: 'NF', dialCode: '672', lengths: [6] },
  { iso: 'BN', dialCode: '673', lengths: [7] },
  { iso: 'NR', dialCode: '674', lengths: [7] },
  { iso: 'PG', dialCode: '675', lengths: [7, 8] },
  { iso: 'TO', dialCode: '676', lengths: [5, 7] },
  { iso: 'SB', dialCode: '677', lengths: [5, 7] },
  { iso: 'VU', dialCode: '678', lengths: [5, 7] },
  { iso: 'FJ', dialCode: '679', lengths: [7] },
  { iso: 'PW', dialCode: '680', lengths: [7] },
  { iso: 'WF', dialCode: '681', lengths: [6] },
  { iso: 'CK', dialCode: '682', lengths: [5] },
  { iso: 'NU', dialCode: '683', lengths: [4, 7] },
  { iso: 'WS', dialCode: '685', lengths: [5, 6, 7, 10] },
  { iso: 'KI', dialCode: '686', lengths: [5, 8] },
  { iso: 'NC', dialCode: '687', lengths: [6] },
  { iso: 'TV', dialCode: '688', lengths: [5, 6, 7] },
  { iso: 'PF', dialCode: '689', lengths: [8] },
  { iso: 'TK', dialCode: '690', lengths: [4, 5, 6, 7] },
  { iso: 'FM', dialCode: '691', lengths: [7] },
  { iso: 'MH', dialCode: '692', lengths: [7] },
  { iso: 'KP', dialCode: '850', trunk: '0', lengths: [8, 10] },
  { iso: 'HK', dialCode: '852', lengths: [8], format: '#### ####', example: '51234567' },
  { iso: 'MO', dialCode: '853', lengths: [8], format: '#### ####', example: '66123456' },
  { iso: 'KH', dialCode: '855', trunk: '0', lengths: [8, 9] },
  { iso: 'LA', dialCode: '856', trunk: '0', lengths: [8, 9, 10] },
  { iso: 'BD', dialCode: '880', trunk: '0', lengths: [8, 9, 10], format: '####-######', example: '1812345678' },
  { iso: 'TW', dialCode: '886', trunk: '0', lengths: [8, 9], format: '### ### ###', example: '912345678' },
  { iso: 'MV', dialCode: '960', lengths: [7] },
  { iso: 'LB', dialCode: '961', trunk: '0', lengths: [7, 8] },
  { iso: 'JO', dialCode: '962', trunk: '0', lengths: [8, 9], format: '# #### ####', example: '790123456' },
  { iso: 'SY', dialCode: '963', trunk: '0', lengths: [8, 9] },
  { iso: 'IQ', dialCode: '964', trunk: '0', lengths: [8, 9, 10] },
  { iso: 'KW', dialCode: '965', lengths: [7, 8], format: '#### ####', example: '50012345' },
  { iso: 'SA', dialCode: '966', trunk: '0', lengths: [9], format: '## ### ####', example: '512345678' },
  { iso: 'YE', dialCode: '967', trunk: '0', lengths: [7, 8, 9] },
  { iso: 'OM', dialCode: '968', lengths: [8] },
  { iso: 'PS', dialCode: '970', trunk: '0', lengths: [8, 9] },
  { iso: 'AE', dialCode: '971', trunk: '0', lengths: [8, 9], format: '## ### ####', example: '501234567' },
  { iso: 'IL', dialCode: '972', trunk: '0', lengths: [8, 9], format: '##-###-####', example: '502345678' },
  { iso: 'BH', dialCode: '973', lengths: [8] },
  { iso: 'QA', dialCode: '974', lengths: [7, 8], format: '#### ####', example: '33123456' },
  { iso: 'BT', dialCode: '975', lengths: [7, 8] },
  { iso: 'MN', dialCode: '976', trunk: '0', lengths: [8] },
  { iso: 'NP', dialCode: '977', trunk: '0', lengths: [8, 9, 10] },
  { iso: 'TJ', dialCode: '992', lengths: [9] },
  { iso: 'TM', dialCode: '993', trunk: '8', lengths: [8] },
  { iso: 'AZ', dialCode: '994', trunk: '0', lengths: [9] },
  { iso: 'GE', dialCode: '995', trunk: '0', lengths: [9] },
  { iso: 'KG', dialCode: '996', trunk: '0', lengths: [9] },
  { iso: 'UZ', dialCode: '998', lengths: [9] },
]

const BY_ISO = new Map(PHONE_COUNTRIES.map((country) => [country.iso, country]))

/** The country for an ISO 3166-1 alpha-2 code, in any case. */
export function phoneCountry(iso: string | null | undefined): PhoneCountry | undefined {
  return iso ? BY_ISO.get(iso.trim().toUpperCase()) : undefined
}

/** The flag emoji of a country: its two regional indicator symbols. */
export function flagEmoji(iso: string): string {
  return [...iso.toUpperCase()].map((letter) => String.fromCodePoint(0x1f1a5 + letter.charCodeAt(0))).join('')
}

/** Keeps the digits of a string. */
export function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

/**
 * The country of an international number (digits after the `+`): the longest calling code that matches, then the
 * country of that code whose area code starts the national number. `preferred` wins a shared code without an area
 * code match (a +1 number typed with the US picked stays in the US, with Canada picked stays in Canada).
 */
export function detectCountry(international: string, preferred?: PhoneCountry): { country: PhoneCountry; national: string } | undefined {
  for (let size = 3; size >= 1; size--) {
    const code = international.slice(0, size)
    if (code.length < size) continue
    const candidates = PHONE_COUNTRIES.filter((country) => country.dialCode === code)
    if (!candidates.length) continue
    const national = international.slice(size)
    const byArea = candidates.find((country) => country.areaCodes?.some((area) => national.startsWith(area)))
    if (byArea) return { country: byArea, national }
    if (preferred && preferred.dialCode === code) return { country: preferred, national }
    return { country: candidates.find((country) => !country.areaCodes) ?? candidates[0], national }
  }
  return undefined
}

/** The national significant number: the digits typed in the national field, without the trunk prefix. */
export function significantNumber(country: PhoneCountry, digits: string): string {
  const { trunk } = country
  // A trunk prefix is only dropped when what follows can still be a full number: `1` alone in the US is not a trunk.
  if (trunk && digits.startsWith(trunk) && digits.length > trunk.length) return digits.slice(trunk.length)
  return digits
}

/** Whether a national significant number has a length the country's numbering plan allows. */
export function isPossibleNumber(country: PhoneCountry, significant: string): boolean {
  if (country.lengths) return country.lengths.includes(significant.length)
  return significant.length >= 4 && significant.length + country.dialCode.length <= 15
}

/** Groups a national significant number for display; digits beyond the pattern are appended as typed. */
export function formatSignificant(country: PhoneCountry, significant: string): string {
  if (!significant) return ''
  const pattern = country.format ?? defaultFormat(significant.length)
  let out = ''
  let index = 0
  for (const symbol of pattern) {
    if (index >= significant.length) break
    if (symbol === '#') out += significant[index++]
    else out += symbol
  }
  if (index < significant.length) out += significant.slice(index)
  return out
}

/** Groups of three, the last one of four (`123 456 7890`), for countries without a recorded grouping. */
function defaultFormat(length: number): string {
  if (length <= 4) return '#'.repeat(length)
  const groups: number[] = [4]
  let rest = length - 4
  while (rest > 0) {
    groups.unshift(Math.min(3, rest))
    rest -= 3
  }
  return groups.map((size) => '#'.repeat(size)).join(' ')
}

/**
 * The national field's text for its digits: the trunk prefix (when typed) glued to the grouped significant number,
 * as it is written inside the country (`06 12 34 56 78`, `(415) 555-0132`).
 */
export function formatNational(country: PhoneCountry, digits: string): string {
  const significant = significantNumber(country, digits)
  const trunk = digits.slice(0, digits.length - significant.length)
  const formatted = formatSignificant(country, significant)
  // A US trunk `1` reads as `1 (415) …`; a European `0` is glued to the area code (`06 12 …`).
  if (trunk && /^\D/.test(formatted)) return `${trunk} ${formatted}`
  return trunk + formatted
}
