// Country flags for the World Cup predictor. We render flags from flagcdn.com by
// ISO 3166-1 alpha-2 code (works on every platform, unlike flag emoji on Windows).
// The admin picks a country in the match editor; a manual flag URL can override it.

export function flagUrl(code, override) {
  if (override) return override
  const c = String(code || '').trim().toLowerCase()
  return c ? `https://flagcdn.com/w160/${c}.png` : ''
}

// A broad list of nations (FIFA members likely to appear at WC 2026). Sorted by
// name for the admin dropdown. Codes are ISO 3166-1 alpha-2 (lowercase).
export const COUNTRIES = [
  { code: 'ar', name: 'Argentina' },
  { code: 'au', name: 'Australia' },
  { code: 'at', name: 'Austria' },
  { code: 'be', name: 'Belgium' },
  { code: 'br', name: 'Brazil' },
  { code: 'ca', name: 'Canada' },
  { code: 'cm', name: 'Cameroon' },
  { code: 'cl', name: 'Chile' },
  { code: 'cn', name: 'China' },
  { code: 'co', name: 'Colombia' },
  { code: 'cr', name: 'Costa Rica' },
  { code: 'hr', name: 'Croatia' },
  { code: 'cz', name: 'Czechia' },
  { code: 'dk', name: 'Denmark' },
  { code: 'cd', name: 'DR Congo' },
  { code: 'ec', name: 'Ecuador' },
  { code: 'eg', name: 'Egypt' },
  { code: 'gb-eng', name: 'England' },
  { code: 'fr', name: 'France' },
  { code: 'de', name: 'Germany' },
  { code: 'gh', name: 'Ghana' },
  { code: 'gr', name: 'Greece' },
  { code: 'hn', name: 'Honduras' },
  { code: 'is', name: 'Iceland' },
  { code: 'ir', name: 'Iran' },
  { code: 'iq', name: 'Iraq' },
  { code: 'it', name: 'Italy' },
  { code: 'ci', name: 'Ivory Coast' },
  { code: 'jm', name: 'Jamaica' },
  { code: 'jp', name: 'Japan' },
  { code: 'jo', name: 'Jordan' },
  { code: 'kr', name: 'South Korea' },
  { code: 'lb', name: 'Lebanon' },
  { code: 'mx', name: 'Mexico' },
  { code: 'ma', name: 'Morocco' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'nz', name: 'New Zealand' },
  { code: 'ng', name: 'Nigeria' },
  { code: 'gb-nir', name: 'Northern Ireland' },
  { code: 'no', name: 'Norway' },
  { code: 'pa', name: 'Panama' },
  { code: 'py', name: 'Paraguay' },
  { code: 'pe', name: 'Peru' },
  { code: 'pl', name: 'Poland' },
  { code: 'pt', name: 'Portugal' },
  { code: 'qa', name: 'Qatar' },
  { code: 'ie', name: 'Ireland' },
  { code: 'sa', name: 'Saudi Arabia' },
  { code: 'gb-sct', name: 'Scotland' },
  { code: 'sn', name: 'Senegal' },
  { code: 'rs', name: 'Serbia' },
  { code: 'za', name: 'South Africa' },
  { code: 'es', name: 'Spain' },
  { code: 'se', name: 'Sweden' },
  { code: 'ch', name: 'Switzerland' },
  { code: 'tn', name: 'Tunisia' },
  { code: 'tr', name: 'Turkey' },
  { code: 'ua', name: 'Ukraine' },
  { code: 'ae', name: 'United Arab Emirates' },
  { code: 'us', name: 'United States' },
  { code: 'uy', name: 'Uruguay' },
  { code: 've', name: 'Venezuela' },
  { code: 'gb-wls', name: 'Wales' },
]

export const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name || ''
