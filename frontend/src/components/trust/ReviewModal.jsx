import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiStar } from 'react-icons/hi2'
import api from '../../api/client'
import { parseApiError } from '../../utils/errors'
import Modal from '../Modal'

const LABELS = ['', 'stars1', 'stars2', 'stars3', 'stars4', 'stars5']

/** Write or update a review of a seller (only allowed after a delivered order). */
export default function ReviewModal({ sellerId, sellerName, onClose, onSaved }) {
  const { t } = useTranslation()
  const [state, setState] = useState({ loading: true, canReview: false })
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get(`/sellers/${sellerId}/reviews/mine/`)
      .then(({ data }) => {
        setState({ loading: false, canReview: data.can_review })
        if (data.review) {
          setRating(data.review.rating)
          setComment(data.review.comment)
        }
      })
      .catch(() => setState({ loading: false, canReview: false }))
  }, [sellerId])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { data } = await api.post(`/sellers/${sellerId}/reviews/`, { rating, comment })
      toast.success(t('trust.reviewSaved'))
      onSaved?.(data)
      onClose()
    } catch (err) {
      toast.error(parseApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const shown = hover || rating
  return (
    <Modal open onClose={onClose} title={t('trust.rateSeller', { name: sellerName })}>
      {state.loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-stone-200/60" />
      ) : !state.canReview ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-amber-900">🔒 {t('trust.reviewOnlyAfterDelivery')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="text-center">
            <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} / 5`}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  className="p-1 transition hover:scale-110"
                >
                  <HiStar className={`size-11 ${n <= shown ? 'text-amber-400' : 'text-stone-200'}`} />
                </button>
              ))}
            </div>
            <p className="mt-1 h-6 font-bold text-stone-700">{shown ? t(`trust.${LABELS[shown]}`) : ''}</p>
          </div>
          <div>
            <label htmlFor="review-comment" className="mb-1.5 block text-sm font-bold text-stone-700">{t('trust.yourReview')}</label>
            <textarea
              id="review-comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('trust.reviewPlaceholder')}
              className="input py-3"
            />
          </div>
          <p className="text-sm text-stone-500">✅ {t('trust.verifiedPurchaseNote')}</p>
          <button type="submit" disabled={busy || !rating} className="btn-accent w-full">
            {busy ? t('auth.pleaseWait') : t('trust.submitReview')}
          </button>
        </form>
      )}
    </Modal>
  )
}
