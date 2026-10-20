export function formatPrice(value) {
  const amount = Number(value)
  if (Number.isNaN(amount)) return ''
  return `Rs ${amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
}

/** Short PKR amounts: 1,250,000 → "12.5 lac", 32,000,000 → "3.2 crore". */
export function formatShortPrice(value) {
  const amount = Number(value)
  if (amount >= 1e7) return `Rs ${+(amount / 1e7).toFixed(1)} crore`
  if (amount >= 1e5) return `Rs ${+(amount / 1e5).toFixed(1)} lac`
  return formatPrice(amount)
}

export function formatNumber(value) {
  return Number(value).toLocaleString('en-PK', { maximumFractionDigits: 2 })
}

export function categoryName(category, lang) {
  if (!category) return ''
  return lang === 'ur' && category.name_ur ? category.name_ur : category.name
}

/** 03001234567 / +923001234567 → 923001234567 for wa.me links. */
export function toWhatsAppNumber(phone) {
  // phone is null when the number is hidden until payment
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('92')) return digits
  if (digits.startsWith('0')) return `92${digits.slice(1)}`
  return digits
}

export function timeAgo(dateString, lang) {
  const seconds = Math.round((new Date(dateString) - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang === 'ur' ? 'ur' : 'en', { numeric: 'auto' })
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'minute')
}

/** Colours per category kind. Full class names so Tailwind can see them. */
export const KIND_STYLES = {
  crop: { tile: 'bg-amber-100 hover:bg-amber-200/70', ring: 'ring-amber-200', badge: 'bg-amber-100 text-amber-900', emoji: '🌾' },
  fertilizer: { tile: 'bg-teal-100 hover:bg-teal-200/70', ring: 'ring-teal-200', badge: 'bg-teal-100 text-teal-900', emoji: '🧪' },
  spray: { tile: 'bg-violet-100 hover:bg-violet-200/70', ring: 'ring-violet-200', badge: 'bg-violet-100 text-violet-900', emoji: '🧴' },
  seed: { tile: 'bg-lime-100 hover:bg-lime-200/70', ring: 'ring-lime-200', badge: 'bg-lime-100 text-lime-900', emoji: '🌱' },
  equipment: { tile: 'bg-orange-100 hover:bg-orange-200/70', ring: 'ring-orange-200', badge: 'bg-orange-100 text-orange-900', emoji: '🚜' },
  livestock: { tile: 'bg-sky-100 hover:bg-sky-200/70', ring: 'ring-sky-200', badge: 'bg-sky-100 text-sky-900', emoji: '🐄' },
}

export const kindStyle = (kind) => KIND_STYLES[kind] ?? KIND_STYLES.crop
