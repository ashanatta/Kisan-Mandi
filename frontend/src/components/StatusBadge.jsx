import { useTranslation } from 'react-i18next'
import { LISTING_STATUS_STYLES, ORDER_STATUS_STYLES } from '../utils/labels'

const ICONS = {
  awaiting_payment: '💳',
  pending: '🔒',
  confirmed: '👍',
  shipped: '🚚',
  delivered: '📦',
  completed: '✅',
  disputed: '⚠️',
  refunded: '💸',
  cancelled: '✖️',
  approved: '✅',
  rejected: '⛔',
}

/** Status pill with icon + text, so status is never shown by colour alone. */
export default function StatusBadge({ status, type = 'order' }) {
  const { t } = useTranslation()
  const styles = type === 'order' ? ORDER_STATUS_STYLES : LISTING_STATUS_STYLES
  const label = type === 'order' ? t(`orderStatus.${status}`) : t(`listingStatus.${status}`)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] ?? ''}`}>
      <span aria-hidden>{ICONS[status]}</span>
      {label}
    </span>
  )
}
