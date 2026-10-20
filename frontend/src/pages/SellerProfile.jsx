import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa'
import { HiOutlineMapPin, HiOutlinePhone, HiStar } from 'react-icons/hi2'
import { Link, useParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import Stars from '../components/Stars'
import ReviewList from '../components/trust/ReviewList'
import ReviewModal from '../components/trust/ReviewModal'
import VerifiedBadge from '../components/trust/VerifiedBadge'
import { useAuth } from '../context/AuthContext'
import useApi from '../hooks/useApi'
import { toWhatsAppNumber } from '../utils/format'

function TrustStat({ emoji, value, label }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
      <p className="latin text-2xl font-extrabold">{value}</p>
      <p className="text-sm text-brand-100">{emoji} {label}</p>
    </div>
  )
}

export default function SellerProfile() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { user } = useAuth()
  const seller = useApi(`/sellers/${id}/`)
  const listings = useApi('/products/', { seller: id, page_size: 12 })
  const [reviewing, setReviewing] = useState(false)
  const [reviewKey, setReviewKey] = useState(0)

  if (seller.error) {
    return (
      <div className="container-page py-10">
        <EmptyState emoji="🧑‍🌾" title={t('trust.sellerNotFound')} action={<Link to="/products" className="btn-primary">{t('nav.market')}</Link>} />
      </div>
    )
  }
  const s = seller.data
  const isMe = user && s && user.id === s.id
  const total = s ? Object.values(s.rating_breakdown).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="container-page space-y-8 py-8">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-6 text-white sm:p-8">
        <div aria-hidden className="absolute -end-8 -top-8 select-none text-[10rem] opacity-10">👨‍🌾</div>
        {!s ? (
          <div className="h-40 animate-pulse rounded-3xl bg-white/10" />
        ) : (
          <div className="relative">
            <div className="flex flex-wrap items-center gap-5">
              <span className="latin grid size-20 place-items-center rounded-3xl bg-white/15 text-3xl font-extrabold ring-4 ring-white/20">
                {s.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="flex flex-wrap items-center gap-2 text-3xl font-extrabold">
                  {s.name} {s.is_verified && <VerifiedBadge />}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-brand-100">
                  <span className="flex items-center gap-1"><HiOutlineMapPin className="size-4" /> {s.city}, {s.district}</span>
                  <span>
                    {t('product.memberSince', {
                      date: new Date(s.member_since).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', { month: 'long', year: 'numeric' }),
                    })}
                  </span>
                </p>
              </div>
              {!isMe && (
                <div className="flex w-full gap-2 sm:w-auto">
                  <a href={`tel:${s.phone}`} className="btn flex-1 bg-white text-brand-900 hover:bg-brand-50 sm:flex-none">
                    <HiOutlinePhone className="size-5" /> {t('product.call')}
                  </a>
                  <a href={`https://wa.me/${toWhatsAppNumber(s.whatsapp || s.phone)}`} target="_blank" rel="noreferrer" className="btn flex-1 bg-whatsapp text-white sm:flex-none">
                    <FaWhatsapp className="size-5" /> WhatsApp
                  </a>
                </div>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TrustStat emoji="⭐" value={s.rating ?? '—'} label={t('trust.ratingCount', { count: s.review_count })} />
              <TrustStat emoji="📦" value={s.completed_orders} label={t('trust.completedOrders')} />
              <TrustStat emoji="🏷️" value={s.listings_count} label={t('trust.activeListings')} />
              <TrustStat emoji={s.is_verified ? '🛡️' : '⏳'} value={s.is_verified ? '✔' : '—'} label={s.is_verified ? t('trust.cnicVerified') : t('trust.notVerified')} />
            </div>
          </div>
        )}
      </section>

      {/* Listings */}
      <section>
        <h2 className="section-title mb-5">{t('trust.listingsBy', { name: s?.name ?? '' })}</h2>
        {listings.data?.results.length === 0 ? (
          <p className="text-stone-500">{t('listings.emptyTitle')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {listings.loading
              ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
              : listings.data?.results.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card h-fit p-6">
          <h2 className="text-lg font-extrabold text-brand-950">⭐ {t('product.reviews')}</h2>
          {s && (
            <>
              <p className="latin mt-3 text-5xl font-extrabold text-stone-900">{s.rating ?? '—'}</p>
              <Stars value={s.rating ?? 0} size="size-5" />
              <p className="mt-1 text-sm text-stone-500">{t('trust.ratingCount', { count: s.review_count })}</p>
              <ul className="mt-4 space-y-1.5">
                {/* JS orders numeric keys ascending, so sort 5★ first explicitly */}
                {Object.entries(s.rating_breakdown).sort(([a], [b]) => b - a).map(([star, n]) => (
                  <li key={star} className="flex items-center gap-2 text-sm">
                    <span className="latin flex w-8 items-center gap-0.5 font-semibold text-stone-600">{star}<HiStar className="size-3.5 text-amber-400" /></span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${total ? (n * 100) / total : 0}%` }} />
                    </span>
                    <span className="latin w-6 text-end text-stone-500">{n}</span>
                  </li>
                ))}
              </ul>
              {user && !isMe && (
                <button type="button" onClick={() => setReviewing(true)} className="btn-outline mt-5 w-full">✍️ {t('trust.writeReview')}</button>
              )}
              <p className="mt-3 text-xs text-stone-500">🔒 {t('trust.reviewOnlyAfterDelivery')}</p>
            </>
          )}
        </div>
        <div className="card p-6">
          <ReviewList sellerId={id} canReply={Boolean(isMe)} refreshKey={reviewKey} />
        </div>
      </section>

      {reviewing && s && (
        <ReviewModal sellerId={s.id} sellerName={s.name} onClose={() => setReviewing(false)} onSaved={() => { setReviewKey((k) => k + 1); seller.reload() }} />
      )}
    </div>
  )
}
