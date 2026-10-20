import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import api from '../api/client'
import FormField from '../components/FormField'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { parseApiError } from '../utils/errors'
import { formatNumber, formatPrice } from '../utils/format'
import { PAYMENT_METHODS } from '../utils/labels'

function Success({ orders }) {
  const { t } = useTranslation()
  return (
    <div className="container-page grid min-h-[60svh] place-items-center py-10">
      <div className="card max-w-lg p-8 text-center">
        <div className="mx-auto grid size-24 animate-float place-items-center rounded-full bg-brand-100 text-5xl">🎉</div>
        <h1 className="mt-6 text-3xl font-extrabold text-brand-950">{t('checkout.successTitle')}</h1>
        <p className="mt-2 text-stone-600">{t('checkout.successText', { count: orders.length })}</p>
        <ul className="mt-5 space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 text-start">
              <span>
                <span className="latin block font-bold text-stone-900">{o.order_number}</span>
                <span className="text-sm text-stone-500">👨‍🌾 {o.seller.name}</span>
              </span>
              <span className="latin font-extrabold text-brand-700">{formatPrice(o.total)}</span>
            </li>
          ))}
        </ul>
        <Link to="/orders" className="btn-primary mt-6 w-full">{t('account.myOrders')}</Link>
      </div>
    </div>
  )
}

export default function Checkout() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { cart, loading, reset } = useCart()
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone,
    address: user.address,
    city: user.city,
    district: user.district || user.city,
    notes: '',
    payment_method: 'cod',
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)

  if (placed) return <Success orders={placed} />
  if (!loading && cart.items.length === 0) return <Navigate to="/cart" replace />

  const field = (key) => ({ value: form[key] ?? '', onChange: (e) => setForm({ ...form, [key]: e.target.value }), error: errors[key] })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      const { data } = await api.post('/orders/checkout/', form)
      reset()
      setPlaced(data)
    } catch (err) {
      const parsed = parseApiError(err)
      setErrors(parsed.fields)
      setMessage(parsed.message)
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
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(PAYMENT_METHODS).map(([key, emoji]) => (
                <label
                  key={key}
                  className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 transition ${
                    form.payment_method === key ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <input type="radio" name="payment" value={key} checked={form.payment_method === key} onChange={() => setForm({ ...form, payment_method: key })} className="size-5 accent-brand-600" />
                  <span className="text-2xl">{emoji}</span>
                  <span className="font-bold text-stone-800">{t(`payment.${key}`)}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-stone-500">ℹ️ {t('checkout.paymentNote')}</p>
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
            <button type="submit" disabled={busy || loading} className="btn-accent mt-5 w-full">
              {busy ? t('auth.pleaseWait') : t('checkout.placeOrder')}
            </button>
          </div>
        </aside>
      </form>
    </div>
  )
}
