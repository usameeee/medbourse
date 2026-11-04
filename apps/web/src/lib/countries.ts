/**
 * Fixed country set for pickers. Only the ISO 3166-1 alpha-2 codes live here — the
 * localized name comes from `Intl.DisplayNames` and the flag is derived from the code,
 * so there is no per-country or per-language data to maintain.
 */
const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT ' +
  'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM ' +
  'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

const VALID_CODE = /^[A-Z]{2}$/;

const KNOWN_CODES = new Set(COUNTRY_CODES.split(' '));

export interface Country {
  code: string;
  name: string;
  flag: string;
}

const flagCache = new Map<string, string>();
const nameLookups = new Map<string, Intl.DisplayNames | null>();

function localeNames(locale: string): Intl.DisplayNames | null {
  const cached = nameLookups.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  let created: Intl.DisplayNames | null = null;
  try {
    created = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  } catch {
    created = null;
  }
  nameLookups.set(locale, created);
  return created;
}

/** Regional-indicator flag emoji for an ISO alpha-2 code (some platforms render it as the two letters). */
export function countryFlag(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!VALID_CODE.test(normalized)) {
    return '🏳️';
  }
  const cached = flagCache.get(normalized);
  if (cached) {
    return cached;
  }
  const flag = String.fromCodePoint(
    ...[...normalized].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
  flagCache.set(normalized, flag);
  return flag;
}

/** Localized country name for an alpha-2 code; falls back to the raw code when it is unknown. */
export function countryName(code: string, locale: string): string {
  const normalized = code.trim().toUpperCase();
  if (!VALID_CODE.test(normalized)) {
    return code;
  }
  return localeNames(locale)?.of(normalized) ?? normalized;
}

/** Every known country, localized and sorted for the active locale. */
export function listCountries(locale: string): Country[] {
  const names = localeNames(locale);
  return COUNTRY_CODES.split(' ')
    .map((code) => ({ code, name: names?.of(code) ?? code, flag: countryFlag(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/**
 * Best-effort ISO alpha-2 guess from the browser's locale list (e.g. "tr-TR" → "TR").
 * Used only to prefill pickers the user can always change; returns `null` when the
 * locale carries no usable region subtag.
 */
export function guessCountryCode(): string | null {
  const locales = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const locale of locales) {
    const region = locale.split('-')[1]?.toUpperCase();
    if (region && VALID_CODE.test(region) && KNOWN_CODES.has(region)) {
      return region;
    }
  }
  return null;
}
