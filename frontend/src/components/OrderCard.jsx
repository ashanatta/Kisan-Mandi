import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa'
import { HiChevronDown, HiOutlineLockClosed, HiOutlinePhone } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { formatDate } from '../utils/dates'
import { parseApiError } from '../utils/errors'
import { formatNumber, formatPrice, timeAgo, toWhatsAppNumber } from '../utils/format'
import { DISPUTE_REASONS, HELD_STATUSES, PAYMENT_METHODS } from '../utils/labels'
import StatusBadge from './StatusBadge'
import DisputeModal from './trust/DisputeModal'
import ReviewModal from './trust/ReviewModal'
import VerifiedBadge from './trust/VerifiedBadge'

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered', 'completed']
const ACTION_STYLES = {
  confirmed: 'btn-primary',
  shipped: 'btn-primary',
  delivered: 'btn-primary',
  completed: 'btn-primary',
  cancelled: 'btn border-2 border-red-200 bg-white text-red-700 hover:bg-red-50',
}

function Progress({ status }) {
  const { t } = useTranslation()
  if (!STEPS.includes(status)) return null
  const current = STEPS.indexOf(status)
  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => (
        <li key={step} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span className={`grid size-8 place-items-center rounded-full text-sm font-bold ${i <= current ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-400'}`}>
              {i < current || status === 'completed' ? '✓' : i + 1}
            </span>
            <span className={`text-center text-[11px] font-semibold leading-tight ${i <= current ? 'text-brand-800' : 'text-stone-400'}`}>{t(`orderSteps.${step}`)}</span>
          </div>
          {i < STEPS.length - 1 && <span className={`mx-1 mb-5 h-1 flex-1 rounded-full ${i < current ? 'bg-brand-500' : 'bg-stone-100'}`} />}
        </li>
      ))}
    </ol>
  )
}

/** The money panel: where the buyer's money is right now. */
function EscrowPanel({ order, as }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const amount = formatPrice(order.total)

  if (order.status === 'awaiting_payment') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-orange-50 px-4 py-3">
        <p className="text-sm font-semibold text-orange-900">💳 {t('escrow.awaitingPayment')}</p>
        {as === 'buyer' && order.payment && (
          <Link to={`/pay/${order.payment.reference}`} className="btn-accent min-h-11">{t('escrow.payNow')}</Link>
        )}
      </div>
    )
  }
  if (HELD_STATUSES.includes(order.status)) {
    return (
      <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
        <p className="flex items-center gap-2 font-bold text-brand-900">
          <HiOutlineLockClosed className="size-5" /> {t('escrow.held', { amount })}
        </p>
        <p className="mt-1 text-sm text-brand-800">
          {order.status === 'disputed'
            ? t('escrow.heldDispute')
            : order.status === 'delivered' && order.release_at
              ? t(as === 'buyer' ? 'escrow.releaseOnBuyer' : 'escrow.releaseOnSeller', { date: formatDate(order.release_at.slice(0, 10), lang) })
              : t(as === 'buyer' ? 'escrow.heldBuyer' : 'escrow.heldSeller')}
        </p>
      </div>
    )
  }
  if (order.status === 'completed' && as === 'seller' && order.payout) {
    const p = order.payout
    return (
      <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
        <p className="font-bold text-brand-900">✅ {t('escrow.released')}</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-stone-500">{t('escrow.sale')}</p><p className="latin font-bold">{formatPrice(p.gross)}</p></div>
          <div><p className="text-stone-500">{t('escrow.commission')}</p><p className="latin font-bold">− {formatPrice(p.commission)}</p></div>
          <div><p className="text-stone-500">{t('escrow.youGet')}</p><p className="latin font-extrabold text-brand-700">{formatPrice(p.net)}</p></div>
        </div>
        <p className="mt-2 font-semibold text-brand-800">{p.status === 'paid' ? `💸 ${t('escrow.payoutPaid')}` : `⏳ ${t('escrow.payoutPending')}`}</p>
      </div>
    )
  }
  if (order.status === 'completed' && as === 'buyer') {
    return <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-900">✅ {t('escrow.completedBuyer')}</p>
  }
  return null
}

function DisputePanel({ order, as, onRespond }) {
  const { t } = useTranslation()
  const d = order.dispute
  if (!d) return null
  const open = d.status === 'open'
  return (
    <div className={`rounded-2xl border p-4 ${open ? 'border-red-200 bg-red-50/60' : 'border-stone-200 bg-stone-50'}`}>
      <p className="font-extrabold text-red-900">⚠️ {t('dispute.title')}: {DISPUTE_REASONS[d.reason]} {t(`dispute.reason_${d.reason}`)}</p>
      <div className="mt-3 space-y-3 text-sm">
        <div className="rounded-xl bg-white px-3 py-2">
          <p className="text-xs font-bold text-stone-500">🛒 {t('orders.buyer')}</p>
          <p className="text-stone-800">{d.description}</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-2">
          <p className="text-xs font-bold text-stone-500">👨‍🌾 {t('product.seller')}</p>
          <p className="text-stone-800">{d.seller_response || <span className="italic text-stone-500">{t('dispute.noResponseYet')}</span>}</p>
        </div>
        {d.evidence.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {d.evidence.map((e) => (
              <a key={e.id} href={e.image} target="_blank" rel="noreferrer" title={e.by_buyer ? t('orders.buyer') : t('product.seller')}>
                <img src={e.image} alt="" className={`size-16 rounded-xl object-cover ring-2 ${e.by_buyer ? 'ring-orange-300' : 'ring-sky-300'}`} />
              </a>
            ))}
          </div>
        )}
        {open ? (
          <p className="text-stone-600">⏳ {t('dispute.underReview')}</p>
        ) : (
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs font-bold text-stone-500">⚖️ {t('dispute.decision')}</p>
            <p className="font-bold text-stone-900">{t(`dispute.decision_${d.decision}`)}</p>
            {d.resolution_note && <p className="text-stone-700">{d.resolution_note}</p>}
          </div>
        )}
      </div>
      {open && (
        <button type="button" onClick={onRespond} className="btn-outline mt-3 min-h-10 text-sm">
          {as === 'seller' && !d.seller_response ? `💬 ${t('dispute.respondTitle')}` : `📷 ${t('dispute.addPhotos')}`}
        </button>
      )}
    </div>
  )
}

/** One order. `as` is "buyer" (orders I placed) or "seller" (orders I received). */
export default function OrderCard({ order, as = 'buyer', onChange, defaultOpen = false }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [open, setOpen] = useState(defaultOpen)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(null) // 'review' | 'dispute' | 'respond'
  const party = as === 'seller' ? order.buyer : order.seller

  const act = async (status) => {
    let note = ''
    if (status === 'cancelled') {
      const reason = window.prompt(t('orders.cancelReason'))
      if (reason === null) return
      note = reason
    }
    if (status === 'completed' && !window.confirm(t('escrow.confirmRelease', { amount: formatPrice(order.total) }))) return
    setBusy(true)
    try {
      const { data } = await api.post(`/orders/${order.id}/status/`, { status, note })
      toast.success(t(`orders.done_${status}`))
      onChange?.(data)
    } catch (err) {
      const { message, fields } = parseApiError(err)
      toast.error(message || Object.values(fields)[0])
    } finally {
      setBusy(false)
    }
  }

  const actions = order.allowed_actions.slice().sort((a, b) => (a === 'cancelled') - (b === 'cancelled'))

  return (
    <article className={`card overflow-hidden ${order.status === 'disputed' ? 'ring-2 ring-red-200' : ''}`}>
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
          <EscrowPanel order={order} as={as} />

          {['cancelled', 'refunded'].includes(order.status) && (
            <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
              {order.status === 'cancelled' ? '✖️' : '💸'} {t(`orders.${order.status}`)}
              {order.cancel_reason ? ` — ${order.cancel_reason}` : ''}
            </p>
          )}
          {order.refunds.map((r, i) => (
            <p key={i} className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
              💸 {t('escrow.refund', { amount: formatPrice(r.amount) })} —{' '}
              {r.status === 'sent' ? `${t('escrow.refundSent')}${r.reference ? ` (${r.reference})` : ''}` : t('escrow.refundPending')}
            </p>
          ))}

          <DisputePanel order={order} as={as} onRespond={() => setModal('respond')} />

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
              <p className="mt-1 flex items-center gap-1.5 font-bold text-stone-900">
                {party.name} {party.is_verified && <VerifiedBadge size="icon" />}
              </p>
              {party.phone ? (
                <>
                  <p className="latin text-sm text-stone-600" dir="ltr">{party.phone}</p>
                  <div className="mt-3 flex gap-2">
                    <a href={`tel:${party.phone}`} className="btn-outline min-h-10 flex-1 px-3 text-sm">
                      <HiOutlinePhone className="size-4" /> {t('orders.call')}
                    </a>
                    <a href={`https://wa.me/${toWhatsAppNumber(party.whatsapp || party.phone)}?text=${encodeURIComponent(`Order ${order.order_number}`)}`} target="_blank" rel="noreferrer" className="btn min-h-10 flex-1 bg-whatsapp px-3 text-sm text-white">
                      <FaWhatsapp className="size-4" /> WhatsApp
                    </a>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-stone-500">🔒 {t('escrow.contactAfterPayment')}</p>
              )}
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{t('checkout.delivery')}</p>
              <p className="mt-1 font-bold text-stone-900">{order.full_name}</p>
              <p className="text-stone-600">{order.address}, {order.city}</p>
              <p className="mt-2 font-semibold text-stone-700">{PAYMENT_METHODS[order.payment_method]} {t(`payment.${order.payment_method}`)}</p>
              {order.notes && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-stone-600">📝 {order.notes}</p>}
            </div>
          </div>

          {(actions.length > 0 || order.can_dispute) && (
            <div className="flex flex-wrap gap-2">
              {actions.map((status) => (
                <button key={status} type="button" disabled={busy} onClick={() => act(status)} className={`${ACTION_STYLES[status]} flex-1 sm:flex-none`}>
                  {t(`orders.action_${status}`)}
                </button>
              ))}
              {order.can_dispute && (
                <button type="button" onClick={() => setModal('dispute')} className="btn flex-1 border-2 border-red-200 bg-red-50 text-red-800 hover:bg-red-100 sm:flex-none">
                  ⚠️ {t('dispute.reportProblem')}
                </button>
              )}
            </div>
          )}
          {as === 'buyer' && order.status === 'completed' && (
            <button type="button" onClick={() => setModal('review')} className="btn-accent w-full sm:w-auto">⭐ {t('trust.rateSellerShort')}</button>
          )}
        </div>
      )}

      {modal === 'review' && <ReviewModal sellerId={order.seller.id} sellerName={order.seller.name} onClose={() => setModal(null)} />}
      {(modal === 'dispute' || modal === 'respond') && (
        <DisputeModal order={order} mode={modal === 'dispute' ? 'open' : 'respond'} onClose={() => setModal(null)} onSaved={onChange} />
      )}
    </article>
  )
}
