/** Local date → "YYYY-MM-DD" (no timezone shift). */
export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const today = () => toISO(new Date())

export const RANGE_KEYS = ['all', 'thisMonth', 'lastMonth', 'rabi', 'kharif', 'thisYear', 'lastYear']

/**
 * Report ranges. Pakistani seasons: Rabi = Nov–Apr, Kharif = May–Oct.
 * Each season preset is the current one, or the most recent if it hasn't started.
 */
export function rangePresets(now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth() // 0 = Jan
  const d = (yy, mm, dd) => toISO(new Date(yy, mm, dd))
  const lastDay = (yy, mm) => new Date(yy, mm + 1, 0).getDate()

  const rabiStartYear = m >= 10 ? y : y - 1
  const kharifYear = m >= 4 ? y : y - 1

  return {
    all: { start: '', end: '' },
    thisMonth: { start: d(y, m, 1), end: d(y, m, lastDay(y, m)) },
    lastMonth: { start: d(y, m - 1, 1), end: d(y, m - 1, lastDay(y, m - 1)) },
    rabi: { start: d(rabiStartYear, 10, 1), end: d(rabiStartYear + 1, 3, 30) },
    kharif: { start: d(kharifYear, 4, 1), end: d(kharifYear, 9, 31) },
    thisYear: { start: d(y, 0, 1), end: d(y, 11, 31) },
    lastYear: { start: d(y - 1, 0, 1), end: d(y - 1, 11, 31) },
  }
}

export function formatDate(iso, lang) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}
