import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiOutlineAdjustmentsHorizontal, HiOutlineMagnifyingGlass, HiXMark } from 'react-icons/hi2'
import { useSearchParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import useApi from '../hooks/useApi'
import { categoryName } from '../utils/format'

const CITIES = ['Lahore', 'Faisalabad', 'Multan', 'Okara', 'Sahiwal', 'Bahawalpur', 'Rahim Yar Khan', 'Gujranwala', 'Sargodha', 'Hyderabad', 'Sukkur', 'Peshawar']
const FILTER_KEYS = ['search', 'category', 'kind', 'min_price', 'max_price', 'city', 'condition', 'listing_type', 'ordering', 'seller']

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25'
          : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'
      }`}
    >
      {children}
    </button>
  )
}

function FilterPanel({ filters, update, onDone }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState({
    min_price: filters.min_price ?? '',
    max_price: filters.max_price ?? '',
    city: filters.city ?? '',
  })

  const apply = (e) => {
    e.preventDefault()
    update(draft)
    onDone?.()
  }

  const radio = (key, options) => (
    <div className="flex flex-wrap gap-2">
      {[['', t('products.any')], ...options].map(([value, label]) => (
        <Chip key={value || 'any'} active={(filters[key] ?? '') === value} onClick={() => update({ [key]: value })}>
          {label}
        </Chip>
      ))}
    </div>
  )

  return (
    <form onSubmit={apply} className="space-y-7">
      <div>
        <h3 className="mb-3 font-bold text-brand-950">{t('products.price')}</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={t('products.min')}
            value={draft.min_price}
            onChange={(e) => setDraft({ ...draft, min_price: e.target.value })}
            className="input latin"
          />
          <span className="text-stone-400">–</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={t('products.max')}
            value={draft.max_price}
            onChange={(e) => setDraft({ ...draft, max_price: e.target.value })}
            className="input latin"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-bold text-brand-950">{t('products.city')}</h3>
        <input
          list="city-list"
          placeholder={t('products.cityPlaceholder')}
          value={draft.city}
          onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          className="input"
        />
        <datalist id="city-list">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <button type="submit" className="btn-primary w-full">
        {t('products.apply')}
      </button>

      <div>
        <h3 className="mb-3 font-bold text-brand-950">{t('products.condition')}</h3>
        {radio('condition', [
          ['new', t('conditions.new')],
          ['used', t('conditions.used')],
        ])}
      </div>

      <div>
        <h3 className="mb-3 font-bold text-brand-950">{t('products.listingType')}</h3>
        {radio('listing_type', [
          ['sale', t('listingTypes.sale')],
          ['rent', t('listingTypes.rent')],
        ])}
      </div>
    </form>
  )
}

export default function Products() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [searchParams, setSearchParams] = useSearchParams()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  const [searchText, setSearchText] = useState(searchParams.get('search') ?? '')

  const filters = useMemo(() => {
    const out = {}
    FILTER_KEYS.forEach((k) => {
      const v = searchParams.get(k)
      if (v) out[k] = v
    })
    return out
  }, [searchParams])
  const filtersKey = JSON.stringify(filters)

  useEffect(() => setPage(1), [filtersKey])
  useEffect(() => setSearchText(searchParams.get('search') ?? ''), [searchParams])

  const categories = useApi('/categories/')
  const { data, loading, error, reload } = useApi('/products/', { ...filters, page })

  useEffect(() => {
    if (data) setItems((prev) => (page === 1 ? data.results : [...prev, ...data.results]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const update = (changes) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setSearchParams(next)
  }

  const selectedParent = categories.data?.find(
    (c) =>
      c.slug === filters.category ||
      c.children.some((ch) => ch.slug === filters.category) ||
      (!filters.category && c.kind === filters.kind),
  )
  const activeCount = ['min_price', 'max_price', 'city', 'condition', 'listing_type'].filter((k) => filters[k]).length
  const showSkeleton = loading && page === 1

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="bg-gradient-to-b from-brand-100/70 to-transparent">
        <div className="container-page pb-6 pt-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950 sm:text-4xl">{t('products.title')}</h1>
          <p className="mt-1 text-stone-600">{t('products.subtitle')}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              update({ search: searchText.trim() })
            }}
            className="mt-5 flex gap-2"
          >
            <label className="relative flex-1">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={t('hero.searchPlaceholder')}
                className="input ps-12 shadow-sm"
              />
            </label>
            <button type="submit" className="btn-primary">
              <span className="hidden sm:inline">{t('hero.search')}</span>
              <HiOutlineMagnifyingGlass className="size-5 sm:hidden" />
            </button>
          </form>

          {/* Category chips */}
          <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip active={!filters.category && !filters.kind} onClick={() => update({ category: '', kind: '' })}>
              ✨ {t('products.all')}
            </Chip>
            {categories.data?.map((c) => (
              <Chip key={c.id} active={selectedParent?.id === c.id} onClick={() => update({ category: c.slug, kind: '' })}>
                {c.icon} {categoryName(c, lang)}
              </Chip>
            ))}
          </div>
          {selectedParent && selectedParent.children.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
              {selectedParent.children.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => update({ category: ch.slug, kind: '' })}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    filters.category === ch.slug ? 'bg-brand-900 text-white' : 'bg-white/70 text-stone-600 hover:bg-white'
                  }`}
                >
                  {ch.icon} {categoryName(ch, lang)}
                  <span className="latin ms-1 opacity-60">{ch.product_count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="container-page grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="card sticky top-24 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-brand-950">{t('products.filters')}</h2>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => update({ min_price: '', max_price: '', city: '', condition: '', listing_type: '' })}
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  {t('products.clear')}
                </button>
              )}
            </div>
            <FilterPanel key={filtersKey} filters={filters} update={update} />
          </div>
        </aside>

        <div>
          {/* Toolbar */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="font-semibold text-stone-600">
              {data ? t('products.results', { count: data.count }) : ' '}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDrawerOpen(true)} className="btn-outline relative min-h-11 px-4 lg:hidden">
                <HiOutlineAdjustmentsHorizontal className="size-5" />
                {t('products.filters')}
                {activeCount > 0 && (
                  <span className="latin grid size-5 place-items-center rounded-full bg-amber-400 text-xs text-brand-950">
                    {activeCount}
                  </span>
                )}
              </button>
              <select
                aria-label={t('products.sort')}
                value={filters.ordering ?? ''}
                onChange={(e) => update({ ordering: e.target.value })}
                className="input min-h-11 w-auto cursor-pointer py-0 pe-8 text-sm font-semibold"
              >
                <option value="">{t('products.sortNewest')}</option>
                <option value="price">{t('products.sortPriceLow')}</option>
                <option value="-price">{t('products.sortPriceHigh')}</option>
                <option value="-views_count">{t('products.sortPopular')}</option>
              </select>
            </div>
          </div>

          {error && !loading ? (
            <EmptyState
              emoji="🔌"
              title={t('products.error')}
              action={
                <button type="button" onClick={reload} className="btn-primary">
                  {t('products.retry')}
                </button>
              }
            />
          ) : !showSkeleton && items.length === 0 && data ? (
            <EmptyState
              emoji="🔍"
              title={t('products.emptyTitle')}
              text={t('products.emptyText')}
              action={
                <button type="button" onClick={() => setSearchParams({})} className="btn-outline">
                  {t('products.clear')}
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
              {showSkeleton
                ? Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)
                : items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          {data?.next && (
            <div className="mt-8 text-center">
              <button type="button" disabled={loading} onClick={() => setPage((p) => p + 1)} className="btn-outline min-w-48">
                {loading ? '…' : t('products.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85svh] animate-fade-up overflow-y-auto rounded-t-[2rem] bg-cream p-6 pb-10">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-stone-300" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-brand-950">{t('products.filters')}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDrawerOpen(false)}
                className="grid size-11 place-items-center rounded-full bg-white text-stone-600"
              >
                <HiXMark className="size-6" />
              </button>
            </div>
            <FilterPanel key={filtersKey} filters={filters} update={update} onDone={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
