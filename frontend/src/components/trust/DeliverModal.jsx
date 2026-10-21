import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import useApi from '../../hooks/useApi'
import { parseApiError } from '../../utils/errors'
import Modal from '../Modal'

/**
 * Seller marks an order delivered: with the buyer's 4-digit delivery code (proof
 * the buyer has the goods), or without it by uploading a delivery photo.
 */
export default function DeliverModal({ order, onClose, onSaved }) {
  const { t } = useTranslation()
  const rules = useApi('/payments/methods/')
  const locked = order.code_attempts_left === 0
  const [mode, setMode] = useState(locked ? 'photo' : 'code')
  const [code, setCode] = useState('')
  const [proof, setProof] = useState(null)
  const [courier, setCourier] = useState('')
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const body = new FormData()
    if (mode === 'code') {
      body.append('code', code)
    } else {
      body.append('proof', proof)
      body.append('courier_name', courier)
      body.append('tracking_number', tracking)
    }
    setBusy(true)
    try {
      const { data } = await api.post(`/orders/${order.id}/deliver/`, body)
      toast.success(t('orders.done_delivered'), { duration: 6000 })
      onSaved?.(data)
      onClose()
    } catch (err) {
      const { message, fields } = parseApiError(err)
      toast.error(message || Object.values(fields)[0])
      // A wrong code uses up a try: refresh the order so the counter is right.
      if (mode === 'code') {
        api.get(`/orders/${order.id}/`).then((res) => {
          onSaved?.(res.data)
          if (res.data.code_attempts_left === 0) setMode('photo')
        })
        setCode('')
      }
    } finally {
      setBusy(false)
    }
  }

  const tab = (key, label, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setMode(key)}
      className={`min-h-12 flex-1 rounded-2xl px-3 text-sm font-bold transition disabled:opacity-40 ${
        mode === key ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 hover:bg-stone-100'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Modal open onClose={onClose} title={`📦 ${t('delivery.modalTitle')}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2 rounded-2xl bg-stone-100 p-1">
          {tab('code', `🔑 ${t('delivery.withCode')}`, locked)}
          {tab('photo', `📷 ${t('delivery.withPhoto')}`)}
        </div>

        {mode === 'code' ? (
          <>
            <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
              ✅ {t('delivery.codeExplain', { days: rules.data?.protection_days ?? 3 })}
            </p>
            <div>
              <label htmlFor="delivery-code" className="mb-1.5 block text-sm font-bold text-stone-700">{t('delivery.codeLabel')}</label>
              <input
                id="delivery-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • •"
                dir="ltr"
                className="input latin text-center text-3xl font-extrabold tracking-[0.5em]"
              />
              {order.code_attempts_left != null && (
                <p className="mt-1 text-xs text-stone-500">{t('delivery.attemptsLeft', { count: order.code_attempts_left })}</p>
              )}
            </div>
          </>
        ) : (
          <>
            {locked && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">🔒 {t('delivery.locked')}</p>}
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              ⚠️ {t('delivery.photoExplain', { days: rules.data?.unverified_protection_days ?? 7 })}
            </p>
            <div>
              <label htmlFor="delivery-proof" className="mb-1.5 block text-sm font-bold text-stone-700">📷 {t('delivery.proofPhoto')}</label>
              <input id="delivery-proof" type="file" accept="image/*" required onChange={(e) => setProof(e.target.files[0] || null)} className="input py-2.5" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="courier" className="mb-1.5 block text-sm font-bold text-stone-700">{t('delivery.courier')}</label>
                <input id="courier" maxLength={60} value={courier} onChange={(e) => setCourier(e.target.value)} placeholder={t('delivery.courierPlaceholder')} className="input" />
              </div>
              <div>
                <label htmlFor="tracking" className="mb-1.5 block text-sm font-bold text-stone-700">{t('delivery.tracking')}</label>
                <input id="tracking" maxLength={60} value={tracking} onChange={(e) => setTracking(e.target.value)} dir="ltr" className="input latin" />
              </div>
            </div>
          </>
        )}

        <button type="submit" disabled={busy || (mode === 'code' ? code.length !== 4 : !proof)} className="btn-primary w-full">
          {busy ? t('auth.pleaseWait') : t('delivery.submit')}
        </button>
      </form>
    </Modal>
  )
}
