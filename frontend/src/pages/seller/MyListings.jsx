import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiOutlineEye, HiOutlineEyeSlash, HiOutlinePencilSquare, HiOutlineTrash, HiPlus } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import { PriceUnit } from '../../components/ProductCard'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import useApi from '../../hooks/useApi'
import { parseApiError } from '../../utils/errors'
import { categoryName, formatNumber, formatShortPrice, timeAgo } from '../../utils/format'

const TABS = ['', 'approved', 'pending', 'rejected']

export default function MyListings() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [tab, setTab] = useState('')
  const stats = useApi('/my/products/stats/')
  const list = useApi('/my/products/', { status: tab || undefined, page_size: 50 })
  const products = list.data?.results ?? []

  const reload = () => {
    list.reload()
    stats.reload()
  }

  const toggleActive = async (p) => {
    try {
      await api.patch(`/my/products/${p.id}/`, { is_active: !p.is_active })
      toast.success(p.is_active ? t('listings.hidden') : t('listings.shown'))
      reload()
    } catch (err) {
      toast.error(parseApiError(err).message)
    }
  }

  const remove = async (p) => {
    if (!window.confirm(t('listings.confirmDelete', { title: p.title }))) return
    try {
      await api.delete(`/my/products/${p.id}/`)
      toast.success(t('listings.deleted'))
      reload()
    } catch (err) {
      toast.error(parseApiError(err).message)
    }
  }

  const s = stats.data
  return (
    <div className="container-page py-8">
      <PageHeader
        emoji="📦"
        title={t('account.myListings')}
        subtitle={t('listings.subtitle')}
        actions={
          <Link to="/sell" className="btn-accent">
            <HiPlus className="size-5" /> {t('account.addProduct')}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard emoji="📦" label={t('listings.total')} value={s ? s.total : '—'} sub={s && t('listings.liveCount', { count: s.approved })} />
        <StatCard emoji="⏳" label={t('listingStatus.pending')} value={s ? s.pending : '—'} sub={s?.rejected ? t('listings.rejectedCount', { count: s.rejected }) : t('listings.awaitingApproval')} />
        <StatCard emoji="👀" label={t('listings.views')} value={s ? formatNumber(s.views) : '—'} />
        <Link to="/orders/received" className="block transition hover:-translate-y-0.5">
          <StatCard
            emoji="📥"
            label={t('account.receivedOrders')}
            value={s ? s.orders_pending : '—'}
            sub={s && t('listings.salesTotal', { amount: formatShortPrice(s.sales_total) })}
            tone={s?.orders_pending ? 'expense' : 'neutral'}
            className={s?.orders_pending ? 'ring-2 ring-amber-300' : ''}
          />
        </Link>
      </div>

      <div className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4">
        {TABS.map((key) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => setTab(key)}
            className={`chip ${tab === key ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'}`}
          >
            {key ? t(`listingStatus.${key}`) : t('products.all')}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {list.loading && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-stone-200/60" />)}
        {!list.loading && products.length === 0 && (
          <EmptyState
            emoji="🌱"
            title={t('listings.emptyTitle')}
            text={t('listings.emptyText')}
            action={<Link to="/sell" className="btn-primary">{t('account.addProduct')}</Link>}
          />
        )}
        {!list.loading &&
          products.map((p) => (
            <article key={p.id} className={`card flex flex-col gap-4 p-3 sm:flex-row sm:items-center sm:p-4 ${p.is_active ? '' : 'opacity-70'}`}>
              <div className="flex min-w-0 flex-1 gap-4">
                <img src={p.primary_image} alt="" className="size-20 shrink-0 rounded-2xl bg-stone-100 object-cover sm:size-24" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} type="listing" />
                    {!p.is_active && (
                      <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-700">🙈 {t('listings.hiddenBadge')}</span>
                    )}
                    <span className="text-xs text-stone-500">
                      {p.category.icon} {categoryName(p.category, lang)}
                    </span>
                  </div>
                  <h3 className="mt-1 truncate font-bold text-stone-900">{p.title}</h3>
                  <PriceUnit product={p} className="block font-extrabold text-brand-700" />
                  <p className="text-xs text-stone-500">
                    {t('product.available')}: <span className="latin">{formatNumber(p.quantity)}</span> {t(`units.${p.unit}`)} · 👀{' '}
                    <span className="latin">{p.views_count}</span> · {timeAgo(p.created_at, lang)}
                  </p>
                  {p.status === 'rejected' && p.rejection_reason && (
                    <p className="mt-1 rounded-xl bg-red-50 px-3 py-1.5 text-sm text-red-700">⛔ {p.rejection_reason}</p>
                  )}
                  {p.linked_business_name && (
                    <p className="mt-1 text-xs font-semibold text-brand-700">📊 {t('listings.linkedTo', { name: p.linked_business_name })}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                {p.status === 'approved' && p.is_active && (
                  <Link to={`/products/${p.id}`} className="btn-ghost min-h-11 flex-1 px-3 text-sm sm:flex-none">
                    <HiOutlineEye className="size-5" /> {t('listings.view')}
                  </Link>
                )}
                <Link to={`/my/listings/${p.id}/edit`} className="btn-outline min-h-11 flex-1 px-3 text-sm sm:flex-none">
                  <HiOutlinePencilSquare className="size-5" /> {t('listings.edit')}
                </Link>
                <button type="button" onClick={() => toggleActive(p)} className="btn-ghost min-h-11 flex-1 px-3 text-sm sm:flex-none">
                  {p.is_active ? <HiOutlineEyeSlash className="size-5" /> : <HiOutlineEye className="size-5" />}
                  {p.is_active ? t('listings.hide') : t('listings.show')}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  aria-label={t('listings.delete')}
                  title={t('listings.delete')}
                  className="btn min-h-11 px-3 text-red-700 hover:bg-red-50"
                >
                  <HiOutlineTrash className="size-5" />
                </button>
              </div>
            </article>
          ))}
      </div>
    </div>
  )
}
