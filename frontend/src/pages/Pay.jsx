import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiOutlineClipboardDocument } from 'react-icons/hi2'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import EmptyState from '../components/EmptyState'
import FormField from '../components/FormField'
import ProtectionBanner from '../components/trust/ProtectionBanner'
import { useCart } from '../context/CartContext'
import useApi from '../hooks/useApi'
import { parseApiError } from '../utils/errors'
import { formatPrice } from '../utils/format'
import { PAYMENT_METHODS } from '../utils/labels'

function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const left = until ? Math.max(0, new Date(until) - now) : 0
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return { left, label: h ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}` }
}

/** Posts the signed JazzCash form so the browser leaves for the JazzCash payment page. */
function redirectToGateway({ url, fields }) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = url
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  })
  document.body.appendChild(form)
  form.submit()
}

function BankTransfer({ payment, bank, onDone }) {
  const { t } = useTranslation()
  const [txn, setTxn] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success(t('pay.copied')))

  const submit = async (e) => {
    e.preventDefault()
    const body = new FormData()
    body.append('bank_txn_id', txn)
    if (receipt) body.append('receipt', receipt)
    setBusy(true)
    try {
      await api.post(`/payments/${payment.reference}/bank-receipt/`, body)
      onDone()
    } catch (err) {
      setErrors(parseApiError(err).fields)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl bg-stone-50 p-4">
        {[
          ['pay.bankName', bank.bank_name],
          ['pay.accountTitle', bank.account_title],
          ['pay.accountNumber', bank.account_number],
          ['pay.amountToSend', formatPrice(payment.amount)],
          ['pay.reference', payment.reference],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-stone-200 py-2 last:border-0">
            <span className="text-sm text-stone-500">{t(label)}</span>
            <button type="button" onClick={() => copy(value)} className="latin flex items-center gap-1 font-bold text-stone-900" dir="ltr">
              {value} <HiOutlineClipboardDocument className="size-4 text-stone-400" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-sm text-stone-600">{t('pay.bankHint')}</p>
      <FormField label={t('pay.bankTxnId')} value={txn} onChange={(e) => setTxn(e.target.value)} error={errors.bank_txn_id} />
      <div>
        <label className="mb-1.5 block text-sm font-bold text-stone-700" htmlFor="receipt">{t('pay.receipt')}</label>
        <input id="receipt" type="file" accept="image/*" onChange={(e) => setReceipt(e.target.files[0] ?? null)} className="input py-2.5" />
        {errors.receipt && <p className="mt-1.5 text-sm font-semibold text-red-600">{errors.receipt}</p>}
      </div>
      <button type="submit" disabled={busy || !txn || !receipt} className="btn-primary w-full">
        {busy ? t('auth.pleaseWait') : t('pay.submitReceipt')}
      </button>
    </form>
  )
}

function Outcome({ payment }) {
  const { t } = useTranslation()
  const { refresh } = useCart()
  const failed = ['failed', 'expired'].includes(payment.status)
  useEffect(() => {
    if (failed) refresh() // items were put back in the cart
  }, [failed, refresh])

  if (payment.status === 'paid') {
    return (
      <div className="text-center">
        <div className="mx-auto grid size-24 animate-float place-items-center rounded-full bg-brand-100 text-5xl">🎉</div>
        <h1 className="mt-6 text-3xl font-extrabold text-brand-950">{t('pay.paidTitle')}</h1>
        <p className="mt-2 text-stone-600">{t('pay.paidText', { amount: formatPrice(payment.amount) })}</p>
        <ul className="mt-5 space-y-2 text-start">
          {payment.orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
              <span>
                <span className="latin block font-bold text-stone-900">{o.order_number}</span>
                <span className="text-sm text-stone-500">👨‍🌾 {o.seller_name}</span>
              </span>
              <span className="latin font-extrabold text-brand-700">{formatPrice(o.total)}</span>
            </li>
          ))}
        </ul>
        <Link to="/orders" className="btn-primary mt-6 w-full">{t('account.myOrders')}</Link>
      </div>
    )
  }
  if (payment.status === 'verifying') {
    return (
      <div className="text-center">
        <div className="text-6xl">🏦</div>
        <h1 className="mt-4 text-2xl font-extrabold text-brand-950">{t('pay.verifyingTitle')}</h1>
        <p className="mt-2 text-stone-600">{t('pay.verifyingText')}</p>
        <Link to="/orders" className="btn-outline mt-6">{t('account.myOrders')}</Link>
      </div>
    )
  }
  return (
    <div className="text-center">
      <div className="text-6xl">😕</div>
      <h1 className="mt-4 text-2xl font-extrabold text-brand-950">{payment.status === 'expired' ? t('pay.expiredTitle') : t('pay.failedTitle')}</h1>
      <p className="mt-2 text-stone-600">{payment.failure_reason}</p>
      <p className="mt-1 text-stone-600">{t('pay.backInCart')}</p>
      <Link to="/cart" className="btn-primary mt-6">{t('pay.tryAgain')}</Link>
    </div>
  )
}

export default function Pay() {
  const { reference } = useParams()
  const { t } = useTranslation()
  const { data: payment, loading, error, reload } = useApi(`/payments/${reference}/`)
  const methods = useApi('/payments/methods/')
  const [action, setAction] = useState(null) // response of /start/
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  const countdown = useCountdown(payment?.expires_at)

  // Ask the backend how to pay as soon as the pending payment is loaded
  useEffect(() => {
    if (!payment || payment.status !== 'pending' || started.current) return
    started.current = true
    api
      .post(`/payments/${reference}/start/`)
      .then(({ data }) => setAction(data))
      .catch((err) => toast.error(parseApiError(err).message))
  }, [payment, reference])

  const simulate = async (result) => {
    setBusy(true)
    try {
      await api.post(`/payments/${reference}/test-result/`, { result })
      reload()
    } catch (err) {
      toast.error(parseApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !payment) return <div className="container-page py-10"><div className="mx-auto h-80 max-w-xl animate-pulse rounded-3xl bg-stone-200/60" /></div>
  if (error || !payment) {
    return (
      <div className="container-page py-10">
        <EmptyState emoji="🔍" title={t('pay.notFound')} action={<Link to="/orders" className="btn-primary">{t('account.myOrders')}</Link>} />
      </div>
    )
  }

  return (
    <div className="container-page max-w-2xl space-y-5 py-8">
      {payment.status !== 'pending' ? (
        <div className="card p-6 sm:p-8"><Outcome payment={payment} /></div>
      ) : (
        <>
          <div className="card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-stone-500">{t('pay.amountToPay')}</p>
                <p className="latin text-4xl font-extrabold text-brand-700">{formatPrice(payment.amount)}</p>
                <p className="mt-1 font-semibold text-stone-700">{PAYMENT_METHODS[payment.method]} {t(`payment.${payment.method}`)}</p>
              </div>
              <div className={`rounded-2xl px-4 py-2 text-center ${countdown.left < 5 * 60000 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-900'}`}>
                <p className="text-xs font-semibold">{t('pay.timeLeft')}</p>
                <p className="latin text-xl font-extrabold">{countdown.label}</p>
              </div>
            </div>

            <div className="mt-6">
              {!action && <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60" />}

              {action?.type === 'test' && (
                <div className="space-y-3">
                  <p className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-900">🧪 {t('pay.testNote')}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" disabled={busy} onClick={() => simulate('success')} className="btn-primary">✅ {t('pay.testSuccess')}</button>
                    <button type="button" disabled={busy} onClick={() => simulate('fail')} className="btn-outline">❌ {t('pay.testFail')}</button>
                  </div>
                </div>
              )}

              {action?.type === 'redirect' && (
                <button type="button" onClick={() => redirectToGateway(action)} className="btn-accent w-full text-lg">
                  {PAYMENT_METHODS[payment.method]} {t('pay.payWith', { method: t(`payment.${payment.method}`) })}
                </button>
              )}

              {action?.type === 'bank' && <BankTransfer payment={payment} bank={action.bank} onDone={reload} />}
            </div>
          </div>
          <ProtectionBanner days={methods.data?.protection_days} />
        </>
      )}
    </div>
  )
}
