import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa'
import {
  HiChevronRight,
  HiMinus,
  HiOutlineClock,
  HiOutlineEye,
  HiOutlineMapPin,
  HiOutlinePhone,
  HiOutlineShoppingCart,
  HiPlus,
} from 'react-icons/hi2'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { parseApiError } from '../utils/errors'
import EmptyState from '../components/EmptyState'
import ReportModal from '../components/trust/ReportModal'
import ReviewList from '../components/trust/ReviewList'
import ReviewModal from '../components/trust/ReviewModal'
import SafetyTips from '../components/trust/SafetyTips'
import VerifiedBadge from '../components/trust/VerifiedBadge'
import ProductCard from '../components/ProductCard'
import { PriceUnit } from '../components/ProductCard'
import SectionHeader from '../components/SectionHeader'
import Stars from '../components/Stars'
import useApi from '../hooks/useApi'
import { categoryName, formatNumber, kindStyle, timeAgo, toWhatsAppNumber } from '../utils/format'

function Gallery({ images, title, fallback }) {
  const [active, setActive] = useState(0)
  const current = images[active]

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-stone-100 shadow-sm">
        {current ? (
          <img key={current.id} src={current.image} alt={title} className="size-full animate-fade-up object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-8xl">{fallback}</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={`size-20 shrink-0 overflow-hidden rounded-2xl ring-4 transition ${
                i === active ? 'ring-brand-500' : 'ring-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <img src={img.image} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddToCart({ product }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { add } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const isRent = product.listing_type === 'rent'
  const max = isRent ? Infinity : Number(product.quantity)

  if (user && user.id === product.seller.id) {
    return (
      <Link to={`/my/listings/${product.id}/edit`} className="btn-outline mt-4 w-full">
        ✏️ {t('product.yourListing')}
      </Link>
    )
  }

  if (!isRent && max <= 0) {
    return (
      <button type="button" disabled className="btn mt-4 w-full bg-stone-200 text-stone-600">
        {t('product.soldOut')}
      </button>
    )
  }

  const submit = async () => {
    if (!user) {
      navigate('/login', { state: { from: location } })
      return
    }
    setBusy(true)
    try {
      await add(product.id, qty)
      toast.success(
        (toastObj) => (
          <span>
            {t('product.addedToCart')}{' '}
            <Link to="/cart" onClick={() => toast.dismiss(toastObj.id)} className="font-extrabold text-brand-700 underline">
              {t('product.viewCart')}
            </Link>
          </span>
        ),
        { duration: 4000 },
      )
    } catch (err) {
      const { message, fields } = parseApiError(err)
      toast.error(fields.quantity || fields.product_id || message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex gap-3">
      <div className="flex items-center rounded-2xl border-2 border-brand-200 bg-white">
        <button type="button" aria-label="−" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-12 place-items-center text-brand-800 disabled:opacity-40">
          <HiMinus className="size-5" />
        </button>
        <input
          type="number"
          min="1"
          inputMode="decimal"
          aria-label={t('sell.quantity')}
          value={qty}
          onChange={(e) => setQty(Math.min(Math.max(Number(e.target.value) || 1, 1), max))}
          className="latin w-14 bg-transparent text-center text-lg font-bold outline-none"
        />
        <button type="button" aria-label="+" disabled={qty >= max} onClick={() => setQty((q) => Math.min(max, q + 1))} className="grid size-12 place-items-center text-brand-800 disabled:opacity-40">
          <HiPlus className="size-5" />
        </button>
      </div>
      <button type="button" disabled={busy} onClick={submit} className="btn-accent flex-1">
        <HiOutlineShoppingCart className="size-5" /> {t('product.addToCart')}
      </button>
    </div>
  )
}

function Spec({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="rounded-2xl bg-stone-50 px-4 py-3">
      <dt className="text-xs font-semibold text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-bold text-stone-900">{value}</dd>
    </div>
  )
}

function SellerCard({ seller, product }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const initials = seller.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
  const whatsapp = `https://wa.me/${toWhatsAppNumber(seller.whatsapp || seller.phone)}?text=${encodeURIComponent(
    t('product.whatsappText', { title: product.title }),
  )}`
  const memberSince = new Date(seller.member_since).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{t('product.seller')}</p>
      <div className="mt-3 flex items-center gap-4">
        <span className="latin grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-lg font-extrabold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <Link to={`/sellers/${seller.id}`} className="flex items-center gap-1.5 hover:underline">
            <span className="truncate text-lg font-extrabold text-brand-950">{seller.name}</span>
            {seller.is_verified && <VerifiedBadge size="icon" />}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-stone-500">
            {seller.rating ? (
              <>
                <Stars value={seller.rating} />
                <span className="latin font-bold text-stone-700">{seller.rating}</span>
                <span className="latin">({seller.review_count})</span>
              </>
            ) : (
              t('product.noRating')
            )}
          </div>
          <p className="text-sm text-stone-500">
            {t('product.memberSince', { date: memberSince })} · {t('product.sellerListings', { count: seller.listings_count })}
          </p>
        </div>
      </div>

      {/* Trust signals */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className={`rounded-2xl px-3 py-2 font-semibold ${seller.is_verified ? 'bg-sky-50 text-sky-900' : 'bg-stone-50 text-stone-500'}`}>
          {seller.is_verified ? `🛡️ ${t('trust.cnicVerified')}` : `⏳ ${t('trust.notVerified')}`}
        </div>
        <div className="rounded-2xl bg-brand-50 px-3 py-2 font-semibold text-brand-900">
          📦 <span className="latin">{seller.completed_orders}</span> {t('trust.completedOrders')}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <a href={`tel:${seller.phone}`} className="btn-primary">
          <HiOutlinePhone className="size-5" /> {t('product.call')}
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="btn bg-whatsapp text-white shadow-lg shadow-green-500/25 hover:brightness-95 focus-visible:ring-green-200"
        >
          <FaWhatsapp className="size-5" /> {t('product.whatsapp')}
        </a>
      </div>
      <p className="latin mt-3 text-center text-sm font-semibold text-stone-500" dir="ltr">
        {seller.phone}
      </p>
      <Link
        to={`/sellers/${seller.id}`}
        className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        {t('trust.viewSellerProfile')}
        <HiChevronRight className="size-4 rtl:rotate-180" />
      </Link>
    </div>
  )
}

function Reviews({ seller }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [writing, setWriting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <section className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold text-brand-950">⭐ {t('product.reviews')}</h2>
        {user && user.id !== seller.id && (
          <button type="button" onClick={() => setWriting(true)} className="text-sm font-bold text-brand-700 hover:underline">
            ✍️ {t('trust.writeReview')}
          </button>
        )}
      </div>
      <ReviewList sellerId={seller.id} refreshKey={refreshKey} />
      {writing && (
        <ReviewModal sellerId={seller.id} sellerName={seller.name} onClose={() => setWriting(false)} onSaved={() => setRefreshKey((k) => k + 1)} />
      )}
    </section>
  )
}

function ReportButton({ product }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  if (user?.id === product.seller.id) return null

  return (
    <>
      <button
        type="button"
        onClick={() => (user ? setOpen(true) : navigate('/login', { state: { from: location } }))}
        className="flex w-full items-center justify-center gap-1 text-sm font-semibold text-stone-500 hover:text-red-700"
      >
        🚩 {t('trust.reportListing')}
      </button>
      {open && <ReportModal productId={product.id} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function ProductDetail() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { data: product, loading, error } = useApi(`/products/${id}/`)
  const related = useApi(product ? '/products/' : null, { category: product?.category.slug, page_size: 5 })

  if (loading) {
    return (
      <div className="container-page grid gap-8 py-8 lg:grid-cols-2">
        <div className="aspect-[4/3] animate-pulse rounded-[2rem] bg-stone-200/70" />
        <div className="space-y-4">
          <div className="h-6 w-1/3 animate-pulse rounded-full bg-stone-200/70" />
          <div className="h-10 w-4/5 animate-pulse rounded-full bg-stone-200/70" />
          <div className="h-12 w-1/2 animate-pulse rounded-full bg-stone-200/70" />
          <div className="h-48 animate-pulse rounded-3xl bg-stone-200/70" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="container-page py-12">
        <EmptyState
          emoji="🍂"
          title={t('product.notFound')}
          action={
            <Link to="/products" className="btn-primary">
              {t('product.back')}
            </Link>
          }
        />
      </div>
    )
  }

  const style = kindStyle(product.category.kind)
  const relatedItems = related.data?.results.filter((p) => p.id !== product.id).slice(0, 4) ?? []

  return (
    <div className="container-page py-6 md:py-10">
      {/* Breadcrumb */}
      <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm text-stone-500">
        <Link to="/products" className="hover:text-brand-700">
          {t('nav.market')}
        </Link>
        <HiChevronRight className="size-4 rtl:rotate-180" />
        <Link to={`/products?category=${product.category.slug}`} className="hover:text-brand-700">
          {categoryName(product.category, lang)}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="space-y-6">
          <Gallery images={product.images} title={product.title} fallback={style.emoji} />

          <section className="card hidden p-6 lg:block">
            <h2 className="text-xl font-extrabold text-brand-950">{t('product.description')}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">{product.description}</p>
          </section>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${style.badge}`}>
                {product.category.icon} {categoryName(product.category, lang)}
              </span>
              {product.listing_type === 'rent' && (
                <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-brand-950">{t('product.forRent')}</span>
              )}
              {product.condition !== 'na' && (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">
                  {t(`conditions.${product.condition}`)}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-3xl">{product.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <span className="flex items-center gap-1">
                <HiOutlineMapPin className="size-4" /> {product.city}, {product.district}
              </span>
              <span className="flex items-center gap-1">
                <HiOutlineClock className="size-4" /> {timeAgo(product.created_at, lang)}
              </span>
              <span className="flex items-center gap-1">
                <HiOutlineEye className="size-4" /> {t('product.views', { count: product.views_count })}
              </span>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-lime-50 p-5 ring-1 ring-brand-100">
            <PriceUnit product={product} className="block text-3xl font-extrabold text-brand-700 sm:text-4xl" />
            <p className="mt-1 font-semibold text-stone-600">
              {t('product.available')}:{' '}
              <span className="latin">{formatNumber(product.quantity)}</span> {t(`units.${product.unit}`)}
            </p>
            <AddToCart product={product} />
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Spec label={t('product.breed')} value={product.breed} />
            <Spec label={t('product.gender')} value={product.gender && t(`genders.${product.gender}`)} />
            <Spec label={t('product.age')} value={product.age_months && t('product.ageMonths', { count: product.age_months })} />
            <Spec label={t('product.weight')} value={product.weight_kg && `${Number(product.weight_kg)} kg`} />
            <Spec
              label={t('product.milk')}
              value={product.milk_liters_per_day && `🥛 ${t('product.milkPerDay', { value: Number(product.milk_liters_per_day) })}`}
            />
            <Spec label={t('product.brand')} value={product.brand} />
            <Spec label={t('product.modelYear')} value={product.model_year} />
            <Spec label={t('product.location')} value={product.district} />
          </dl>

          <SellerCard seller={product.seller} product={product} />

          <section className="card p-6 lg:hidden">
            <h2 className="text-xl font-extrabold text-brand-950">{t('product.description')}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">{product.description}</p>
          </section>

          <Reviews seller={product.seller} />
          <SafetyTips kind={product.category.kind} />
          <ReportButton product={product} />
        </div>
      </div>

      {relatedItems.length > 0 && (
        <section className="mt-16">
          <SectionHeader
            title={t('product.related')}
            linkTo={`/products?category=${product.category.slug}`}
            linkLabel={t('home.viewAll')}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {relatedItems.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
