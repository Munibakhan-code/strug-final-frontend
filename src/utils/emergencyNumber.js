// Emergency service number for the driver's country.
//
// Replaces a hardcoded `tel:911` on the driver SOS panel. 911 is North America only; the platform
// operates in ~69 countries, so a driver in Germany pressing the emergency-call button after an
// SOS was dialling a number that does not exist there.
//
// ⚠️ THIS TABLE IS SAFETY-CRITICAL AND HAS NOT BEEN INDEPENDENTLY VERIFIED. It is a best-effort
// starting point covering the countries in regionConfig.COUNTRY_ISO2, and it should be checked
// against an authoritative source (ITU / each country's own civil-protection agency) before the
// SOS panel is promoted to drivers. Where a country has separate police / ambulance / fire lines
// this uses the number that reaches police or a general emergency operator.
//
// Keyed by ISO 3166-1 alpha-2 so it stays aligned with COUNTRY_ISO2.

const EMERGENCY_BY_ISO2 = {
  // North America
  US: '911', CA: '911', MX: '911', BM: '911', GL: '112',
  // South America
  AR: '911', BO: '110', BR: '190', CL: '133', CO: '123', EC: '911',
  PY: '911', PE: '105', UY: '911', VE: '911',
  // Europe — 112 is the EU-wide single emergency number
  GB: '999', IE: '112', FR: '112', DE: '112', NL: '112', BE: '112', LU: '112',
  AT: '112', CH: '112', MC: '112', DK: '112', SE: '112', FI: '112', NO: '112',
  IS: '112', ES: '112', PT: '112', IT: '112', GR: '112', MT: '112', CY: '112',
  PL: '112', RO: '112', HU: '112', CZ: '112',
  // Middle East
  IL: '112', TR: '112', SA: '911', AE: '999', QA: '999', KW: '112', BH: '999',
  OM: '9999', JO: '911', LB: '112',
  // South Asia
  IN: '112', PK: '15', LK: '119', BD: '999', NP: '100', BT: '113', MV: '119',
  // Oceania
  AU: '000', NZ: '111', FJ: '911', PG: '000', WS: '995', TO: '911', VU: '112',
  // Africa
  ZA: '10111', EG: '122', MA: '19', KE: '999', NG: '112', GH: '112',
  TZ: '112', UG: '999', RW: '112', ET: '911',
  // East / Southeast Asia
  CN: '110', JP: '110', KR: '112', SG: '999', HK: '999', TW: '110',
  TH: '191', VN: '113', ID: '112', MY: '999', PH: '911',
};

// 112 is the GSM standard emergency number: mobile handsets in most of the world route it to the
// local emergency operator, and in North America GSM networks map it onto 911. It is the least
// bad answer when we genuinely do not know where the driver is.
export const FALLBACK_EMERGENCY_NUMBER = '112';

/**
 * @param {string|null|undefined} iso2 ISO 3166-1 alpha-2 country code
 * @returns {{ number: string, known: boolean }} `known` is false when we fell back, so the caller
 *   can label the button honestly rather than implying we verified the local number.
 */
export function emergencyNumberForIso2(iso2) {
  const code = typeof iso2 === 'string' ? iso2.trim().toUpperCase() : '';
  const number = EMERGENCY_BY_ISO2[code];
  return number ? { number, known: true } : { number: FALLBACK_EMERGENCY_NUMBER, known: false };
}

export { EMERGENCY_BY_ISO2 };
