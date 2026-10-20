import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import { parseApiError } from '../../utils/errors'
import Modal from '../Modal'

const REASONS = { fraud: '🚨', fake_photos: '🖼️', wrong_info: '🏷️', sold: '✅', prohibited: '⛔', other: '📝' }

export default function ReportModal({ productId, onClose }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/products/${productId}/report/`, { reason, details })
      toast.success(t('trust.reportThanks'), { duration: 5000 })
      onClose()
    } catch (err) {
      toast.error(parseApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`🚩 ${t('trust.reportListing')}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-stone-600">{t('trust.reportIntro')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(REASONS).map(([key, emoji]) => (
            <label
              key={key}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 transition ${
                reason === key ? 'border-red-400 bg-red-50' : 'border-stone-200 bg-white hover:border-red-200'
              }`}
            >
              <input type="radio" name="reason" value={key} checked={reason === key} onChange={() => setReason(key)} className="size-5 accent-red-600" />
              <span className="text-xl">{emoji}</span>
              <span className="font-semibold text-stone-800">{t(`trust.reason_${key}`)}</span>
            </label>
          ))}
        </div>
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('trust.reportDetails')} className="input py-3" />
        <button type="submit" disabled={busy || !reason} className="btn w-full bg-red-600 text-white hover:bg-red-700">
          {busy ? t('auth.pleaseWait') : t('trust.sendReport')}
        </button>
      </form>
    </Modal>
  )
}
