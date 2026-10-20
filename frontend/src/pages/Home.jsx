import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiArrowRight, HiCheckBadge, HiCheckCircle, HiOutlineMagnifyingGlass, HiOutlineSparkles } from 'react-icons/hi2'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import SectionHeader from '../components/SectionHeader'
import useApi from '../hooks/useApi'
import { categoryName, formatNumber, formatPrice, formatShortPrice, kindStyle } from '../utils/format'
import { CHART } from '../utils/labels'

const POPULAR = [
  ['Wheat', 'گندم'],
  ['Urea', 'یوریا'],
  ['Tractor', 'ٹریکٹر'],
  ['Sahiwal', 'ساہیوال'],
]

// Sample season for the tracker preview chart (PKR thousands)
const SEASON = [
  { month: 'Nov', income: 0, expense: 340 },
  { month: 'Dec', income: 0, expense: 95 },
  { month: 'Jan', income: 0, expense: 68 },
  { month: 'Feb', income: 0, expense: 23 },
  { month: 'Mar', income: 0, expense: 9 },
  { month: 'Apr', income: 0, expense: 148 },
  { month: 'May', income: 1571, expense: 0 },
]

function Hero({ stats }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const isUrdu = i18n.resolvedLanguage === 'ur'

  const search = (value) => navigate(value ? `/products?search=${encodeURIComponent(value)}` : '/products')

  return (
    <section className="relative overflow-hidden bg-brand-900 text-white">
      {/* Background glow and texture */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute -start-32 -top-32 size-[28rem] rounded-full bg-brand-500/40 blur-3xl" />
        <div className="absolute -bottom-40 end-0 size-[32rem] rounded-full bg-amber-400/25 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
      </div>

      <div className="container-page relative grid items-center gap-12 pb-24 pt-10 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:pb-32">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-semibold text-brand-100 backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-lime-300" /> {t('hero.badge')}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            {t('hero.titleStart')}{' '}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-lime-300 bg-clip-text text-transparent">
              {t('hero.titleHighlight')}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-brand-100/90">{t('hero.subtitle')}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              search(query.trim())
            }}
            className="mt-8 flex max-w-xl gap-2 rounded-3xl bg-white p-2 shadow-2xl shadow-black/20"
          >
            <label className="flex flex-1 items-center gap-2 ps-3">
              <HiOutlineMagnifyingGlass className="size-6 shrink-0 text-stone-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('hero.searchPlaceholder')}
                className="min-h-12 w-full bg-transparent text-base text-stone-800 outline-none placeholder:text-stone-400"
              />
            </label>
            <button type="submit" className="btn-accent">
              {t('hero.search')}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-brand-200">{t('hero.popular')}</span>
            {POPULAR.map(([en, ur]) => (
              <button
                key={en}
                type="button"
                onClick={() => search(en)}
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium text-white transition hover:bg-white/15"
              >
                {isUrdu ? ur : en}
              </button>
            ))}
          </div>

          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
            {['products', 'sellers', 'cities', 'categories'].map((key) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <dt className="text-xs font-medium text-brand-200">{t(`stats.${key}`)}</dt>
                <dd className="latin mt-1 text-2xl font-extrabold text-white">
                  {stats ? `${formatNumber(stats[key])}+` : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual />
      </div>

      {/* Curved bottom edge */}
      <svg aria-hidden viewBox="0 0 1440 80" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-px h-12 w-full text-cream md:h-20">
        <path fill="currentColor" d="M0 80V40C240 0 480 0 720 24s480 56 720 16v40Z" />
      </svg>
    </section>
  )
}

function HeroVisual() {
  const { t } = useTranslation()
  const bars = [38, 52, 46, 64, 58, 76, 88]

  return (
    <div className="relative mx-auto hidden w-full max-w-md sm:block lg:max-w-none">
      <div className="relative aspect-[5/4] overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-sky-200 via-amber-100 to-amber-300 shadow-2xl shadow-black/30 ring-1 ring-white/20">
        <div className="absolute end-10 top-8 size-20 rounded-full bg-amber-300 shadow-[0_0_80px_30px_rgba(252,211,77,0.6)]" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 rounded-t-[50%] bg-gradient-to-b from-lime-400 to-brand-600" />
        <div className="absolute inset-x-0 bottom-[22%] flex justify-around text-6xl md:text-7xl">
          <span>🌾</span>
          <span className="translate-y-3">🌾</span>
          <span>🌾</span>
          <span className="translate-y-2">🌾</span>
        </div>
        <div className="absolute bottom-[8%] start-[12%] animate-float-slow text-7xl md:text-8xl">🚜</div>
        <div className="absolute bottom-[10%] end-[10%] text-6xl md:text-7xl">🐄</div>
      </div>

      {/* Profit card */}
      <div className="absolute -start-6 top-10 w-56 animate-float rounded-3xl bg-white p-4 text-stone-800 shadow-2xl shadow-black/25">
        <p className="text-xs font-semibold text-stone-500">{t('hero.cardProfitLabel')}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="latin text-2xl font-extrabold text-brand-700">+Rs 1.9 lac</span>
        </p>
        <span className="text-xs font-bold text-brand-600">▲ {t('hero.cardProfit')}</span>
        <div className="mt-3 flex h-14 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className={`flex-1 rounded-t-md ${i === bars.length - 1 ? 'bg-brand-500' : 'bg-brand-200'}`}
            />
          ))}
        </div>
      </div>

      {/* Order toast */}
      <div className="absolute -bottom-6 -end-4 flex animate-float-slow items-center gap-3 rounded-2xl bg-white p-3 pe-5 text-stone-800 shadow-2xl shadow-black/25 [animation-delay:1.5s]">
        <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-2xl">📦</span>
        <div>
          <p className="flex items-center gap-1 text-sm font-bold">
            <HiCheckCircle className="size-4 text-brand-500" /> {t('hero.cardOrder')}
          </p>
          <p className="text-xs text-stone-500">{t('hero.cardOrderSub')}</p>
        </div>
      </div>
    </div>
  )
}

function Categories({ categories, loading }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage

  return (
    <section className="container-page -mt-2 pt-10">
      <SectionHeader title={t('home.categoriesTitle')} subtitle={t('home.categoriesSubtitle')} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {loading &&
          Array.from({ length: 6 }, (_, i) => <div key={i} className="h-44 animate-pulse rounded-3xl bg-stone-200/60" />)}
        {categories?.map((cat) => {
          const style = kindStyle(cat.kind)
          return (
            <Link
              key={cat.id}
              to={`/products?category=${cat.slug}`}
              className={`group relative flex flex-col items-center overflow-hidden rounded-3xl px-3 pb-5 pt-6 text-center transition duration-300 hover:-translate-y-1 hover:shadow-lg ${style.tile}`}
            >
              <span className="grid size-20 place-items-center rounded-full bg-white text-4xl shadow-sm transition duration-300 group-hover:rotate-6 group-hover:scale-110">
                {cat.icon}
              </span>
              <h3 className="mt-3 font-bold leading-snug text-stone-900">{categoryName(cat, lang)}</h3>
              <p className="mt-0.5 text-sm text-stone-600">
                {lang === 'ur' ? cat.name : <span className="font-urdu">{cat.name_ur}</span>}
              </p>
              <span className="mt-2 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                {t('home.listings', { count: cat.product_count })}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function ProductRow({ products, loading, compact }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {loading &&
        Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-64 shrink-0 sm:w-auto">
            <ProductCardSkeleton />
          </div>
        ))}
      {products?.map((p) => (
        <div key={p.id} className="w-64 shrink-0 snap-start sm:w-auto">
          <ProductCard product={p} compact={compact} />
        </div>
      ))}
    </div>
  )
}

function TrackerPromo() {
  const { t } = useTranslation()
  const income = SEASON.reduce((s, m) => s + m.income, 0)
  const expense = SEASON.reduce((s, m) => s + m.expense, 0)

  return (
    <section className="container-page mt-20">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-50 via-white to-amber-50 p-6 ring-1 ring-brand-100 sm:p-10 lg:p-14">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">
              <HiOutlineSparkles className="size-4" /> {t('home.trackerBadge')}
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-brand-950 sm:text-4xl">{t('home.trackerTitle')}</h2>
            <p className="mt-4 text-lg text-stone-600">{t('home.trackerText')}</p>
            <ul className="mt-6 space-y-3">
              {['trackerPoint1', 'trackerPoint2', 'trackerPoint3'].map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <HiCheckCircle className="mt-0.5 size-6 shrink-0 text-brand-500" />
                  <span className="font-medium text-stone-700">{t(`home.${key}`)}</span>
                </li>
              ))}
            </ul>
            <Link to="/tracker" className="btn-primary mt-8">
              {t('home.trackerCta')}
              <HiArrowRight className="size-5 rtl:rotate-180" />
            </Link>
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-500">🌾 Wheat Crop 2025-26</p>
                <p className="latin text-3xl font-extrabold text-brand-700">{formatShortPrice((income - expense) * 1000)}</p>
                <p className="text-sm font-semibold text-brand-600">▲ {t('home.chartProfit')}</p>
              </div>
              <div className="flex gap-4 text-sm font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full" style={{ background: CHART.income }} /> {t('home.chartIncome')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full" style={{ background: CHART.expense }} /> {t('home.chartExpense')}
                </span>
              </div>
            </div>
            <div className="latin mt-6 h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SEASON} barGap={4}>
                  <CartesianGrid vertical={false} stroke="#e7e5e4" strokeDasharray="4 4" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#78716c', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: '#78716c', fontSize: 12 }} tickFormatter={(v) => `${v}k`} />
                  <Tooltip
                    cursor={{ fill: '#f0f9f1' }}
                    contentStyle={{ borderRadius: 16, border: '1px solid #e7e5e4' }}
                    formatter={(value, name) => [formatPrice(value * 1000), name === 'income' ? t('home.chartIncome') : t('home.chartExpense')]}
                  />
                  <Bar dataKey="income" fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                  <Bar dataKey="expense" fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const { t } = useTranslation()
  const steps = [
    ['📸', 'how1Title', 'how1Text', 'bg-amber-100'],
    ['📞', 'how2Title', 'how2Text', 'bg-sky-100'],
    ['📈', 'how3Title', 'how3Text', 'bg-brand-100'],
  ]
  return (
    <section className="container-page mt-20">
      <h2 className="section-title text-center">{t('home.howTitle')}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {steps.map(([emoji, title, text, bg], i) => (
          <div key={title} className="card relative p-6">
            <span className="latin absolute end-5 top-4 text-5xl font-extrabold text-stone-100">{i + 1}</span>
            <span className={`relative grid size-14 place-items-center rounded-2xl text-3xl ${bg}`}>{emoji}</span>
            <h3 className="relative mt-4 text-lg font-bold text-brand-950">{t(`home.${title}`)}</h3>
            <p className="relative mt-1 text-stone-600">{t(`home.${text}`)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TrustSection() {
  const { t } = useTranslation()
  // Only claims the platform actually enforces.
  const points = [
    ['🛡️', 'trustPoint1', 'bg-sky-100'],
    ['⭐', 'trustPoint2', 'bg-amber-100'],
    ['✅', 'trustPoint3', 'bg-brand-100'],
    ['🚩', 'trustPoint4', 'bg-red-100'],
  ]
  return (
    <section className="container-page mt-20">
      <div className="rounded-[2.5rem] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-brand-50 p-6 sm:p-10">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-900">
            <HiCheckBadge className="size-4" /> {t('home.trustBadge')}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-brand-950 sm:text-4xl">{t('home.trustTitle')}</h2>
          <p className="mt-3 text-lg text-stone-600">{t('home.trustText')}</p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map(([emoji, key, bg]) => (
            <div key={key} className="card p-5">
              <span className={`grid size-14 place-items-center rounded-2xl text-3xl ${bg}`}>{emoji}</span>
              <h3 className="mt-4 font-extrabold text-brand-950">{t(`home.${key}Title`)}</h3>
              <p className="mt-1 text-sm text-stone-600">{t(`home.${key}Text`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SellCta() {
  const { t } = useTranslation()
  return (
    <section className="container-page mt-20">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-brand-700 via-brand-600 to-lime-600 px-6 py-12 text-white sm:px-12">
        <div aria-hidden className="absolute -bottom-8 end-4 select-none text-[9rem] opacity-20 sm:text-[12rem]">
          🚜
        </div>
        <div className="relative max-w-xl">
          <h2 className="text-3xl font-extrabold sm:text-4xl">{t('home.ctaTitle')}</h2>
          <p className="mt-3 text-lg text-brand-50/90">{t('home.ctaText')}</p>
          <Link to="/sell" className="btn-accent mt-7">
            {t('home.ctaButton')}
            <HiArrowRight className="size-5 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const stats = useApi('/stats/')
  const categories = useApi('/categories/')
  const fresh = useApi('/products/', { page_size: 8 })
  const livestock = useApi('/products/', { kind: 'livestock', page_size: 4, ordering: '-views_count' })

  return (
    <>
      <Hero stats={stats.data} />
      <Categories categories={categories.data} loading={categories.loading} />

      <section className="container-page mt-16">
        <SectionHeader
          title={t('home.freshTitle')}
          subtitle={t('home.freshSubtitle')}
          linkTo="/products"
          linkLabel={t('home.viewAll')}
        />
        <ProductRow products={fresh.data?.results} loading={fresh.loading} />
      </section>

      <section className="mt-16 bg-gradient-to-b from-sky-50 to-transparent py-12">
        <div className="container-page">
          <SectionHeader
            title={`🐄 ${t('home.livestockTitle')}`}
            subtitle={t('home.livestockSubtitle')}
            linkTo="/products?kind=livestock"
            linkLabel={t('home.viewAll')}
          />
          <ProductRow products={livestock.data?.results} loading={livestock.loading} />
        </div>
      </section>

      <TrackerPromo />
      <HowItWorks />
      <TrustSection />
      <SellCta />
    </>
  )
}
