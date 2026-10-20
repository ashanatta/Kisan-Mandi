import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa'
import { HiChevronDown, HiOutlinePhone } from 'react-icons/hi2'
import api from '../api/client'
import { parseApiError } from '../utils/errors'
import { formatNumber, formatPrice, timeAgo, toWhatsAppNumber } from '../utils/format'
import { PAYMENT_METHODS } from '../utils/labels'
import StatusBadge from './StatusBadge'

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered']
const ACTION_STYLES = {
  confirmed: 'btn-primary',
  shipped: 'btn-primary',
  delivered: 'btn-accent',
  cancelled: 'btn border-2 border-red-200 bg-white text-red-700 hover:bg-red-50',
}

function Progress({ status }) {
  const { t } = useTranslation()
  if (status === 'cancelled') return null
  const current = STEPS.indexOf(status)
  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => (
        <li key={step} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span className={`grid size-8 place-items-center rounded-full text-sm font-bold ${i <= current ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-400'}`}>
              {i < current ? '✓' : i + 1}
            </span>
            <span className={`text-[11px] font-semibold ${i <= current ? 'text-brand-800' : 'text-stone-400'}`}>{t(`orderStatus.${step}`)}</span>
          </div>
          {i < STEPS.length - 1 && <span className={`mx-1 mb-5 h-1 flex-1 rounded-full ${i < current ? 'bg-brand-500' : 'bg-stone-100'}`} />}
        </li>
      ))}
    </ol>
  )
}

/** One order. `as` is "buyer" (orders I placed) or "seller" (orders I received). */
export default function OrderCard({ order, as = 'buyer', onChange, defaultOpen = false }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [open, setOpen] = useState(defaultOpen)
  const [busy, setBusy] = useState(false)
  const party = as === 'seller' ? order.buyer : order.seller

  const act = async (status) => {
    let note = ''
    if (status === 'cancelled') {
      const reason = window.prompt(t('orders.cancelReason'))
      if (reason === null) return
      note = reason
    }
    setBusy(true)
    try {
      const { data } = await api.post(`/orders/${order.id}/status/`, { status, note })
      toast.success(t(`orders.done_${status}`))
      onChange?.(data)
    } catch (err) {
      toast.error(parseApiError(err).message || Object.values(parseApiError(err).fields)[0])
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 p-4 text-start sm:p-5" aria-expanded={open}>
        <div className="flex -space-x-3 rtl:space-x-reverse">
          {order.items.slice(0, 3).map((item) => (
            <img key={item.id} src={item.image} alt="" className="size-12 rounded-xl bg-stone-100 object-cover ring-2 ring-white" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="latin font-extrabold text-stone-900">{order.order_number}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="truncate text-sm text-stone-500">
            {as === 'seller' ? '🛒' : '👨‍🌾'} {party.name} · {timeAgo(order.created_at, lang)} · {t('orders.itemsCount', { count: order.items.length })}
          </p>
        </div>
        <span className="latin hidden text-lg font-extrabold text-brand-700 sm:block">{formatPrice(order.total)}</span>
        <HiChevronDown className={`size-5 shrink-0 text-stone-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-stone-100 p-4 sm:p-5">
          <Progress status={order.status} />
          {order.status === 'cancelled' && (
            <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
              ✖️ {t('orders.cancelled')}{order.cancel_reason ? ` — ${order.cancel_reason}` : ''}
            </p>
          )}

          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <img src={item.image} alt="" className="size-14 rounded-xl bg-stone-100 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-stone-800">{item.product_title}</p>
                  <p className="text-sm text-stone-500">
                    <span className="latin">{formatNumber(item.quantity)}</span> {t(`units.${item.unit}`, { defaultValue: t(`rent.${item.unit}`) })} ×{' '}
                    <span className="latin">{formatPrice(item.price)}</span>
                  </p>
                </div>
                <span className="latin font-bold">{formatPrice(item.line_total)}</span>
              </li>
            ))}
            <li className="flex justify-between p-3 text-lg">
              <span className="font-bold">{t('cart.total')}</span>
              <span className="latin font-extrabold text-brand-700">{formatPrice(order.total)}</span>
            </li>
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{as === 'seller' ? t('orders.buyer') : t('product.seller')}</p>
              <p className="mt-1 font-bold text-stone-900">{party.name}</p>
              <p className="latin text-sm text-stone-600" dir="ltr">{party.phone}</p>
              <div className="mt-3 flex gap-2">
                <a href={`tel:${party.phone}`} className="btn-outline min-h-10 flex-1 px-3 text-sm">
                  <HiOutlinePhone className="size-4" /> {t('orders.call')}
                </a>
                <a href={`https://wa.me/${toWhatsAppNumber(party.whatsapp || party.phone)}?text=${encodeURIComponent(`Order ${order.order_number}`)}`} target="_blank" rel="noreferrer" className="btn min-h-10 flex-1 bg-whatsapp px-3 text-sm text-white">
                  <FaWhatsapp className="size-4" /> WhatsApp
                </a>
              </div>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{t('checkout.delivery')}</p>
              <p className="mt-1 font-bold text-stone-900">{order.full_name}</p>
              <p className="text-stone-600">{order.address}, {order.city}</p>
              <p className="latin text-stone-600" dir="ltr">{order.phone}</p>
              <p className="mt-2 font-semibold text-stone-700">{PAYMENT_METHODS[order.payment_method]} {t(`payment.${order.payment_method}`)}</p>
              {order.notes && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-stone-600">📝 {order.notes}</p>}
            </div>
          </div>

          {order.allowed_actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {order.allowed_actions
                .slice()
                .sort((a, b) => (a === 'cancelled') - (b === 'cancelled'))
                .map((status) => (
                  <button key={status} type="button" disabled={busy} onClick={() => act(status)} className={`${ACTION_STYLES[status]} flex-1 sm:flex-none`}>
                    {t(`orders.action_${status}`)}
                  </button>
                ))}
            </div>
          )}
          {as === 'seller' && order.status === 'shipped' && (
            <p className="text-sm text-stone-500">📊 {t('orders.trackerNote')}</p>
          )}
        </div>
      )}
    </article>
  )
}
