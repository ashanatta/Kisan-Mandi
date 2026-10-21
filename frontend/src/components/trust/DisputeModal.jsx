import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { parseApiError } from '../../utils/errors'
import { DISPUTE_REASONS } from '../../utils/labels'
import Modal from '../Modal'

/**
 * `mode="open"`: buyer reports a problem (money stays held).
 * `mode="respond"`: seller answers, or either side adds more photos.
 */
export default function DisputeModal({ order, mode = 'open', onClose, onSaved }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const opening = mode === 'open'

  const submit = async (e) => {
    e.preventDefault()
    const body = new FormData()
    if (opening) {
      body.append('reason', reason)
      body.append('description', text)
    } else {
      body.append('response', text)
    }
    images.forEach((img) => body.append('images', img))
    setBusy(true)
    try {
      const { data } = await api.post(`/orders/${order.id}/${opening ? 'dispute' : 'dispute/respond'}/`, body)
      toast.success(opening ? t('dispute.opened') : t('dispute.responded'), { duration: 6000 })
      onSaved?.(data)
      onClose()
    } catch (err) {
      const { message, fields } = parseApiError(err)
      toast.error(message || Object.values(fields)[0])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={opening ? `⚠️ ${t('dispute.reportProblem')}` : `💬 ${t('dispute.respondTitle')}`} wide>
      <form onSubmit={submit} className="space-y-4">
        {opening && (
          <>
            <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">🔒 {t('dispute.moneySafe')}</p>
            {order.delivery_verified && <p className="text-sm text-stone-600">🔑 {t('delivery.notReceivedBlocked')}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {/* The buyer's delivery code proves receipt, so "not received" no longer applies. */}
              {Object.entries(DISPUTE_REASONS).filter(([key]) => !(order.delivery_verified && key === 'not_received')).map(([key, emoji]) => (
                <label
                  key={key}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 transition ${
                    reason === key ? 'border-red-400 bg-red-50' : 'border-stone-200 bg-white hover:border-red-200'
                  }`}
                >
                  <input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key)} className="size-5 accent-red-600" />
                  <span className="text-xl">{emoji}</span>
                  <span className="font-semibold text-stone-800">{t(`dispute.reason_${key}`)}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <textarea
          rows={4}
          required={opening}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={opening ? t('dispute.describe') : t('dispute.responsePlaceholder')}
          className="input py-3"
        />
        <div>
          <label className="mb-1.5 block text-sm font-bold text-stone-700" htmlFor="evidence">📷 {t('dispute.photos')}</label>
          <input id="evidence" type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files).slice(0, 6))} className="input py-2.5" />
          <p className="mt-1 text-xs text-stone-500">{t('dispute.photosHint')}</p>
        </div>
        <button
          type="submit"
          disabled={busy || (opening && (!reason || !text.trim()))}
          className={`w-full ${opening ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`}
        >
          {busy ? t('auth.pleaseWait') : opening ? t('dispute.submit') : t('dispute.sendResponse')}
        </button>
      </form>
    </Modal>
  )
}
