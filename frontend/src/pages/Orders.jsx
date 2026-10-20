import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import OrderCard from '../components/OrderCard'
import PageHeader from '../components/PageHeader'
import useApi from '../hooks/useApi'

const TABS = ['', 'awaiting_payment', 'pending', 'confirmed', 'shipped', 'delivered', 'disputed', 'completed', 'refunded', 'cancelled']

/** Orders I placed (`as="buyer"`) or orders I received as a seller (`as="seller"`). */
export default function Orders({ as = 'buyer' }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('')
  const counts = useApi('/orders/counts/')
  const list = useApi('/orders/', { as, status: tab || undefined, page_size: 50 })
  const [orders, setOrders] = useState([])

  useEffect(() => {
    if (list.data) setOrders(list.data.results)
  }, [list.data])

  const tabCounts = counts.data?.[as === 'seller' ? 'received' : 'placed']
  const total = tabCounts ? Object.values(tabCounts).reduce((a, b) => a + b, 0) : null

  const replace = (updated) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    counts.reload()
  }

  return (
    <div className="container-page py-8">
      <PageHeader
        emoji={as === 'seller' ? '📥' : '📦'}
        title={as === 'seller' ? t('account.receivedOrders') : t('account.myOrders')}
        subtitle={as === 'seller' ? t('orders.receivedSubtitle') : t('orders.placedSubtitle')}
      />

      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {TABS.filter((key) => !(as === 'seller' && key === 'awaiting_payment')).map((key) => {
          const n = key ? tabCounts?.[key] : total
          return (
            <button
              key={key || 'all'}
              type="button"
              onClick={() => setTab(key)}
              className={`chip ${tab === key ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'}`}
            >
              {key ? t(`orderStatus.${key}`) : t('products.all')}
              {n != null && (
                <span className={`latin rounded-full px-1.5 text-xs ${tab === key ? 'bg-white/20' : ['pending', 'disputed', 'awaiting_payment'].includes(key) && n ? 'bg-amber-400 text-brand-950' : 'bg-stone-100'}`}>{n}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        {list.loading && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-stone-200/60" />)}
        {!list.loading && orders.length === 0 && (
          <EmptyState
            emoji={as === 'seller' ? '📭' : '🛍️'}
            title={t('orders.emptyTitle')}
            text={as === 'seller' ? t('orders.emptyReceived') : t('orders.emptyPlaced')}
            action={<Link to={as === 'seller' ? '/my/listings' : '/products'} className="btn-primary">{as === 'seller' ? t('account.myListings') : t('account.browse')}</Link>}
          />
        )}
        {!list.loading && orders.map((o, i) => <OrderCard key={o.id} order={o} as={as} onChange={replace} defaultOpen={i === 0} />)}
      </div>
    </div>
  )
}
