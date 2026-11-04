/**
 * Fixed ISO 4217 currency set for pickers. Only the three-letter codes live here — the
 * localized name comes from `Intl.DisplayNames`, so there is no per-currency or
 * per-language data to maintain.
 */
const CURRENCY_CODES =
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN ' +
  'BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD ' +
  'CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK ' +
  'DJF DKK DOP DZD ' +
  'EGP ERN ETB EUR ' +
  'FJD FKP ' +
  'GBP GEL GHS GIP GMD GNF GTQ GYD ' +
  'HKD HNL HRK HTG HUF ' +
  'IDR ILS INR IQD IRR ISK ' +
  'JMD JOD JPY ' +
  'KES KGS KHR KMF KPW KRW KWD KYD KZT ' +
  'LAK LBP LKR LRD LSL LYD ' +
  'MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN ' +
  'NAD NGN NIO NOK NPR NZD ' +
  'OMR ' +
  'PAB PEN PGK PHP PKR PLN PYG ' +
  'QAR ' +
  'RON RSD RUB RWF ' +
  'SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL ' +
  'THB TJS TMT TND TOP TRY TTD TWD TZS ' +
  'UAH UGX USD USN UYI UYU UYW UZS ' +
  'VED VES VND VUV ' +
  'WST ' +
  'XAF XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XUA ' +
  'YER ' +
  'ZAR ZMW ZWL';

const VALID_CODE = /^[A-Z]{3}$/;

export interface Currency {
  code: string;
  name: string;
}

const nameLookups = new Map<string, Intl.DisplayNames | null>();

function localeNames(locale: string): Intl.DisplayNames | null {
  const cached = nameLookups.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  let created: Intl.DisplayNames | null = null;
  try {
    created = new Intl.DisplayNames([locale, 'en'], { type: 'currency' });
  } catch {
    created = null;
  }
  nameLookups.set(locale, created);
  return created;
}

/** Localized currency name for a three-letter code; falls back to the raw code when unknown. */
export function currencyName(code: string, locale: string): string {
  const normalized = code.trim().toUpperCase();
  if (!VALID_CODE.test(normalized)) {
    return code;
  }
  return localeNames(locale)?.of(normalized) ?? normalized;
}

/** Every known ISO 4217 currency, localized and sorted for the active locale. */
export function listCurrencies(locale: string): Currency[] {
  const names = localeNames(locale);
  return CURRENCY_CODES.split(' ')
    .map((code) => ({ code, name: names?.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
