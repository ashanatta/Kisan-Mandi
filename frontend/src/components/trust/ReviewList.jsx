import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiCheckCircle } from 'react-icons/hi2'
import api from '../../api/client'
import useApi from '../../hooks/useApi'
import { parseApiError } from '../../utils/errors'
import { timeAgo } from '../../utils/format'
import Stars from '../Stars'

function ReplyForm({ review, onSaved }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(review.seller_reply)
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-bold text-brand-700 hover:underline">
        💬 {review.seller_reply ? t('trust.editReply') : t('trust.reply')}
      </button>
    )
  }
  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/my/reviews/${review.id}/reply/`, { reply: text })
      toast.success(t('trust.replySaved'))
      setOpen(false)
      onSaved()
    } catch (err) {
      toast.error(parseApiError(err).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 space-y-2">
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} className="input py-2 text-sm" placeholder={t('trust.replyPlaceholder')} />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="btn-primary min-h-10 px-4 text-sm">{t('account.save')}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost min-h-10 px-4 text-sm">{t('trust.cancel')}</button>
      </div>
    </div>
  )
}

/** Reviews of one seller, with verified-purchase badges and seller replies. */
export default function ReviewList({ sellerId, canReply = false, refreshKey = 0 }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { data, loading, reload } = useApi(`/sellers/${sellerId}/reviews/`, { page_size: 20 })
  const reviews = data?.results ?? []

  // Parent bumps refreshKey after the user writes a review.
  useEffect(() => {
    if (refreshKey) reload()
  }, [refreshKey, reload])

  if (loading) return <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60" />
  if (reviews.length === 0) return <p className="text-stone-500">{t('product.noReviews')}</p>

  return (
    <ul className="divide-y divide-stone-100">
      {reviews.map((r) => (
        <li key={r.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-stone-800">{r.reviewer_name}</span>
            {r.verified_purchase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                <HiCheckCircle className="size-3.5" /> {t('trust.verifiedPurchase')}
              </span>
            )}
            <span className="ms-auto text-xs text-stone-400">{timeAgo(r.created_at, lang)}</span>
          </div>
          <Stars value={r.rating} />
          {r.comment && <p className="mt-1 text-stone-600">{r.comment}</p>}
          {r.seller_reply && (
            <div className="mt-3 rounded-2xl border-s-4 border-brand-300 bg-brand-50/60 px-4 py-2.5">
              <p className="text-xs font-bold text-brand-800">↩️ {t('trust.sellerReply')}</p>
              <p className="text-sm text-stone-700">{r.seller_reply}</p>
            </div>
          )}
          {canReply && <ReplyForm review={r} onSaved={reload} />}
        </li>
      ))}
    </ul>
  )
}
