/** Emojis and colours for choice fields. Text labels live in the i18n files. */

export const EXPENSE_CATEGORIES = {
  seed: '🌱',
  fertilizer: '🧪',
  spray: '🧴',
  labor: '👷',
  fuel: '⛽',
  electricity: '⚡',
  irrigation: '💧',
  feed: '🌾',
  vet: '💉',
  machinery_rent: '🚜',
  transport: '🚚',
  other: '📝',
}

export const INCOME_SOURCES = {
  crop_sale: '🌾',
  milk_sale: '🥛',
  animal_sale: '🐄',
  egg_sale: '🥚',
  fruit_veg_sale: '🍊',
  machinery_rent: '🚜',
  marketplace: '🛒',
  subsidy: '🏛️',
  other: '💰',
}

export const BUSINESS_TYPES = {
  crop: '🌾',
  dairy: '🐃',
  poultry: '🐓',
  livestock: '🐐',
  orchard: '🍊',
  vegetable: '🥕',
  fishery: '🐟',
  other: '🏡',
}

export const SEASONS = ['rabi', 'kharif', 'year_round']

export const ORDER_STATUS_STYLES = {
  awaiting_payment: 'bg-orange-100 text-orange-900',
  pending: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-sky-100 text-sky-900',
  shipped: 'bg-violet-100 text-violet-900',
  delivered: 'bg-teal-100 text-teal-900',
  completed: 'bg-brand-100 text-brand-900',
  disputed: 'bg-red-100 text-red-800',
  refunded: 'bg-stone-200 text-stone-800',
  cancelled: 'bg-stone-200 text-stone-700',
}

/** Statuses in which the buyer's money is held by Kisan Mandi */
export const HELD_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'disputed']

export const DISPUTE_REASONS = {
  not_received: '📭',
  not_as_described: '🔄',
  damaged: '💔',
  sick_animal: '🤒',
  fake: '🚨',
  other: '📝',
}

export const LISTING_STATUS_STYLES = {
  approved: 'bg-brand-100 text-brand-900',
  pending: 'bg-amber-100 text-amber-900',
  rejected: 'bg-red-100 text-red-800',
}

// Online only – the platform must receive the money to protect the buyer.
export const PAYMENT_METHODS = {
  jazzcash: '📲',
  easypaisa: '📱',
  bank_transfer: '🏦',
}

/*
 * Chart colours (validated with the dataviz palette checker on a white surface):
 * income/expense pair passes colour-blind separation; the 8 category slots keep
 * the validated order. Each expense category always gets the same colour.
 */
export const CHART = {
  income: '#1baf7a',
  expense: '#eb6834',
  profit: '#247638',
  loss: '#d03b3b',
  grid: '#e7e5e4',
  axis: '#78716c',
  other: '#a8a29e',
}

const CATEGORY_SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
// Most common farm costs get a fixed colour; the rest fold into "Other".
const CATEGORY_ORDER = ['feed', 'labor', 'fertilizer', 'seed', 'spray', 'fuel', 'machinery_rent', 'irrigation']

export const categoryColor = (category) => {
  const i = CATEGORY_ORDER.indexOf(category)
  return i === -1 ? CHART.other : CATEGORY_SLOTS[i]
}
