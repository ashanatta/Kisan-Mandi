import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiArrowRight, HiMinus, HiOutlineTrash, HiPlus } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { PriceUnit } from '../components/ProductCard'
import { useCart } from '../context/CartContext'
import { parseApiError } from '../utils/errors'
import { formatPrice } from '../utils/format'

function QuantityStepper({ item }) {
  const { t } = useTranslation()
  const { update } = useCart()
  const [value, setValue] = useState(Number(item.quantity))
  const [busy, setBusy] = useState(false)
  const isRent = item.product.listing_type === 'rent'
  const max = isRent ? Infinity : Number(item.available_quantity)

  const save = async (next) => {
    const qty = Math.min(Math.max(Number(next) || 1, 1), max)
    setValue(qty)
    if (qty === Number(item.quantity)) return
    setBusy(true)
    try {
      await update(item.id, qty)
    } catch (err) {
      const { message, fields } = parseApiError(err)
      toast.error(fields.quantity || message)
      setValue(Number(item.quantity))
    } finally {
      setBusy(false)
    }
  }

  const unit = isRent ? t(`rent.${item.product.rent_period}`) : t(`units.${item.product.unit}`)
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center rounded-2xl border-2 border-stone-200 bg-white ${busy ? 'opacity-60' : ''}`}>
        <button type="button" aria-label="−" disabled={busy || value <= 1} onClick={() => save(value - 1)} className="grid size-11 place-items-center text-brand-800 disabled:opacity-40">
          <HiMinus className="size-5" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => save(e.target.value)}
          className="latin w-14 bg-transparent text-center font-bold outline-none"
        />
        <button type="button" aria-label="+" disabled={busy || value >= max} onClick={() => save(value + 1)} className="grid size-11 place-items-center text-brand-800 disabled:opacity-40">
          <HiPlus className="size-5" />
        </button>
      </div>
      <span className="text-sm text-stone-500">{unit}</span>
    </div>
  )
}

export default function Cart() {
  const { t } = useTranslation()
  const { cart, loading, remove } = useCart()

  if (!loading && cart.items.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState
          emoji="🛒"
          title={t('cart.emptyTitle')}
          text={t('cart.emptyText')}
          action={<Link to="/products" className="btn-primary">{t('account.browse')}</Link>}
        />
      </div>
    )
  }

  // Group items by seller – each group becomes its own order.
  const groups = Object.values(
    cart.items.reduce((acc, item) => {
      ;(acc[item.seller_id] ??= { name: item.seller_name, items: [] }).items.push(item)
      return acc
    }, {}),
  )

  return (
    <div className="container-page py-8">
      <PageHeader emoji="🛒" title={t('cart.title')} subtitle={t('cart.itemsCount', { count: cart.count })} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.name} className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/70 px-5 py-3 text-sm font-bold text-stone-700">
                👨‍🌾 {group.name}
              </header>
              <ul className="divide-y divide-stone-100">
                {group.items.map((item) => (
                  <li key={item.id} className="flex gap-4 p-4 sm:p-5">
                    <Link to={`/products/${item.product.id}`} className="shrink-0">
                      <img src={item.product.primary_image} alt="" className="size-20 rounded-2xl bg-stone-100 object-cover sm:size-24" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/products/${item.product.id}`} className="line-clamp-2 font-bold text-stone-900 hover:text-brand-700">
                        {item.product.title}
                      </Link>
                      <PriceUnit product={item.product} className="block text-sm font-bold text-stone-600" />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <QuantityStepper item={item} />
                        <div className="flex items-center gap-2">
                          <span className="latin text-lg font-extrabold text-brand-700">{formatPrice(item.line_total)}</span>
                          <button
                            type="button"
                            aria-label={t('cart.remove')}
                            onClick={() => remove(item.id).catch(() => {})}
                            className="grid size-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <HiOutlineTrash className="size-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="text-lg font-extrabold text-brand-950">{t('cart.summary')}</h2>
            <dl className="mt-4 space-y-2 text-stone-600">
              <div className="flex justify-between">
                <dt>{t('cart.subtotal')}</dt>
                <dd className="latin font-bold text-stone-900">{formatPrice(cart.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('cart.delivery')}</dt>
                <dd className="text-sm font-semibold">{t('cart.deliveryAgreed')}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-100 pt-3 text-lg">
                <dt className="font-bold text-stone-900">{t('cart.total')}</dt>
                <dd className="latin font-extrabold text-brand-700">{formatPrice(cart.subtotal)}</dd>
              </div>
            </dl>
            {cart.sellers > 1 && (
              <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">ℹ️ {t('cart.splitNote', { count: cart.sellers })}</p>
            )}
            <Link to="/checkout" className="btn-primary mt-5 w-full">
              {t('cart.checkout')} <HiArrowRight className="size-5 rtl:rotate-180" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
