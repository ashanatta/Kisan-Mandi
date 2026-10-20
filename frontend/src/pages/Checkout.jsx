import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import api from '../api/client'
import FormField from '../components/FormField'
import PageHeader from '../components/PageHeader'
import ProtectionBanner from '../components/trust/ProtectionBanner'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import useApi from '../hooks/useApi'
import { parseApiError } from '../utils/errors'
import { formatNumber, formatPrice } from '../utils/format'
import { PAYMENT_METHODS } from '../utils/labels'

export default function Checkout() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { cart, loading, reset } = useCart()
  const navigate = useNavigate()
  const methods = useApi('/payments/methods/')
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone,
    address: user.address,
    city: user.city,
    district: user.district || user.city,
    notes: '',
    payment_method: '',
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && cart.items.length === 0) return <Navigate to="/cart" replace />

  const available = methods.data?.methods ?? []
  const chosen = form.payment_method || available.find((m) => m.enabled)?.key || ''
  const field = (key) => ({ value: form[key] ?? '', onChange: (e) => setForm({ ...form, [key]: e.target.value }), error: errors[key] })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      const { data } = await api.post('/orders/checkout/', { ...form, payment_method: chosen })
      reset()
      navigate(`/pay/${data.payment_reference}`, { replace: true })
    } catch (err) {
      const parsed = parseApiError(err)
      setErrors(parsed.fields)
      setMessage(parsed.message || parsed.fields.payment_method || '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-page py-8">
      <PageHeader emoji="📦" title={t('checkout.title')} subtitle={t('checkout.subtitle')} />
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {message && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">{message}</div>}

          <ProtectionBanner days={methods.data?.protection_days} />

          <section className="card p-6">
            <h2 className="mb-4 text-lg font-extrabold text-brand-950">🏠 {t('checkout.delivery')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('checkout.fullName')} autoComplete="name" {...field('full_name')} />
              <FormField label={t('auth.phone')} type="tel" autoComplete="tel" placeholder="03001234567" {...field('phone')} />
              <FormField label={t('account.address')} autoComplete="street-address" className="sm:col-span-2" placeholder={t('checkout.addressPlaceholder')} {...field('address')} />
              <FormField label={t('auth.city')} autoComplete="address-level2" {...field('city')} />
              <FormField label={t('account.district')} {...field('district')} />
              <div className="sm:col-span-2">
                <label htmlFor="notes" className="mb-1.5 block text-sm font-bold text-stone-700">{t('checkout.notes')}</label>
                <textarea id="notes" rows={3} className="input py-3" placeholder={t('checkout.notesPlaceholder')} {...field('notes')} />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 text-lg font-extrabold text-brand-950">💳 {t('checkout.payment')}</h2>
            {methods.loading && <div className="h-20 animate-pulse rounded-2xl bg-stone-200/60" />}
            <div className="grid gap-3 sm:grid-cols-3">
              {available.map(({ key, enabled, mode }) => (
                <label
                  key={key}
                  className={`relative flex min-h-20 flex-col justify-center gap-1 rounded-2xl border-2 px-4 py-3 transition ${
                    !enabled
                      ? 'cursor-not-allowed border-stone-200 bg-stone-50 opacity-60'
                      : chosen === key
                        ? 'cursor-pointer border-brand-500 bg-brand-50'
                        : 'cursor-pointer border-stone-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="payment"
                      value={key}
                      disabled={!enabled}
                      checked={chosen === key}
                      onChange={() => setForm({ ...form, payment_method: key })}
                      className="size-5 accent-brand-600"
                    />
                    <span className="text-2xl">{PAYMENT_METHODS[key]}</span>
                    <span className="font-bold text-stone-800">{t(`payment.${key}`)}</span>
                  </span>
                  <span className="text-xs font-semibold text-stone-500">
                    {!enabled ? t('payment.comingSoon') : mode === 'test' ? `🧪 ${t('payment.testMode')}` : mode === 'manual' ? t('payment.manualCheck') : t('payment.instant')}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">🚫 {t('checkout.noCod')}</p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="text-lg font-extrabold text-brand-950">{t('cart.summary')}</h2>
            <ul className="mt-4 space-y-3">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <img src={item.product.primary_image} alt="" className="size-12 rounded-xl bg-stone-100 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-800">{item.product.title}</p>
                    <p className="text-xs text-stone-500">
                      <span className="latin">{formatNumber(item.quantity)}</span> × <span className="latin">{formatPrice(item.product.price)}</span>
                    </p>
                  </div>
                  <span className="latin text-sm font-bold">{formatPrice(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-stone-100 pt-4 text-lg">
              <span className="font-bold">{t('cart.total')}</span>
              <span className="latin font-extrabold text-brand-700">{formatPrice(cart.subtotal)}</span>
            </div>
            <button type="submit" disabled={busy || loading || !chosen} className="btn-accent mt-5 w-full">
              🔒 {busy ? t('auth.pleaseWait') : t('checkout.continueToPay')}
            </button>
            <p className="mt-3 text-center text-xs text-stone-500">{t('checkout.payNote')}</p>
          </div>
        </aside>
      </form>
    </div>
  )
}
