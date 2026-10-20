import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiOutlineDocumentChartBar, HiPlus } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import { ExpenseBreakdown, IncomeExpenseChart, Legend } from '../../components/charts'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import useApi from '../../hooks/useApi'
import { RANGE_KEYS, rangePresets } from '../../utils/dates'
import { formatPrice, formatShortPrice } from '../../utils/format'
import { BUSINESS_TYPES, CHART } from '../../utils/labels'
import { BusinessModal } from './TrackerForms'

export function RangeChips({ value, onChange, keys = RANGE_KEYS }) {
  const { t } = useTranslation()
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`chip ${value === key ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'}`}
        >
          {t(`ranges.${key}`)}
        </button>
      ))}
    </div>
  )
}

export function Totals({ totals }) {
  const { t } = useTranslation()
  const profit = Number(totals?.profit ?? 0)
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      <StatCard emoji="💰" label={t('tracker.income')} value={totals ? formatPrice(totals.income) : '—'} tone="income" />
      <StatCard emoji="🧾" label={t('tracker.expense')} value={totals ? formatPrice(totals.expense) : '—'} tone="expense" />
      <StatCard
        emoji={profit >= 0 ? '📈' : '📉'}
        label={profit >= 0 ? t('tracker.profit') : t('tracker.loss')}
        value={totals ? formatPrice(Math.abs(profit)) : '—'}
        tone={profit >= 0 ? 'profit' : 'loss'}
        className={`col-span-2 lg:col-span-1 ${profit >= 0 ? 'bg-brand-50' : 'bg-red-50'}`}
      />
    </div>
  )
}

function BusinessCard({ business }) {
  const { t } = useTranslation()
  const income = Number(business.total_income)
  const expense = Number(business.total_expense)
  const profit = Number(business.profit)
  const max = Math.max(income, expense, 1)

  return (
    <Link to={`/tracker/${business.id}`} className={`card group block p-5 transition hover:-translate-y-1 hover:shadow-lg ${business.is_active ? '' : 'opacity-80'}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-3xl transition group-hover:scale-110">
          {BUSINESS_TYPES[business.business_type]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold text-brand-950">{business.name}</h3>
          <p className="text-sm text-stone-500">
            {t(`bizTypes.${business.business_type}`)} · {t(`seasons.${business.season}`)}
            {!business.is_active && ` · ${t('tracker.closed')}`}
          </p>
        </div>
      </div>
      <p className={`latin mt-4 text-2xl font-extrabold ${profit >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
        {profit >= 0 ? '▲' : '▼'} {formatShortPrice(Math.abs(profit))}
        <span className="ms-2 font-sans text-sm font-semibold text-stone-500">{profit >= 0 ? t('tracker.profit') : t('tracker.loss')}</span>
      </p>
      <div className="mt-3 space-y-1.5 text-sm">
        {[
          ['income', income, CHART.income],
          ['expense', expense, CHART.expense],
        ].map(([key, value, color]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-stone-500">{t(`tracker.${key}`)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <span className="block h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
            </span>
            <span className="latin w-24 shrink-0 text-end font-semibold text-stone-700">{formatShortPrice(value)}</span>
          </div>
        ))}
      </div>
    </Link>
  )
}

export default function TrackerDashboard() {
  const { t } = useTranslation()
  const [range, setRange] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const { start, end } = rangePresets()[range]
  const businesses = useApi('/tracker/businesses/')
  const report = useApi('/tracker/report/', { start: start || undefined, end: end || undefined })
  const r = report.data

  return (
    <div className="container-page py-8">
      <PageHeader
        emoji="📊"
        title={t('nav.tracker')}
        subtitle={t('tracker.subtitle')}
        actions={
          <>
            <Link to="/tracker/reports" className="btn-outline">
              <HiOutlineDocumentChartBar className="size-5" /> {t('tracker.reports')}
            </Link>
            <button type="button" onClick={() => setShowNew(true)} className="btn-accent">
              <HiPlus className="size-5" /> {t('tracker.newBusiness')}
            </button>
          </>
        }
      />

      {businesses.data?.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title={t('tracker.emptyTitle')}
          text={t('tracker.emptyText')}
          action={<button type="button" onClick={() => setShowNew(true)} className="btn-primary"><HiPlus className="size-5" /> {t('tracker.newBusiness')}</button>}
        />
      ) : (
        <>
          <RangeChips value={range} onChange={setRange} />
          <div className="mt-5">
            <Totals totals={r?.totals} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <section className="card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-brand-950">{t('tracker.monthly')}</h2>
                <Legend items={[[t('tracker.income'), CHART.income], [t('tracker.expense'), CHART.expense]]} />
              </div>
              {r && r.by_month.length > 0 ? <IncomeExpenseChart data={r.by_month} /> : <p className="py-16 text-center text-stone-500">{t('tracker.noData')}</p>}
            </section>
            <section className="card p-5 sm:p-6">
              <h2 className="mb-4 text-lg font-extrabold text-brand-950">{t('tracker.whereMoneyWent')}</h2>
              {r && <ExpenseBreakdown data={r.expense_by_category} />}
            </section>
          </div>

          <h2 className="section-title mt-10">{t('tracker.yourBusinesses')}</h2>
          <p className="mb-5 mt-1 text-stone-500">{t('tracker.allTimeNote')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.loading && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-52 animate-pulse rounded-3xl bg-stone-200/60" />)}
            {businesses.data?.map((b) => <BusinessCard key={b.id} business={b} />)}
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/50 font-bold text-brand-700 transition hover:bg-brand-50"
            >
              <span className="grid size-14 place-items-center rounded-full bg-white text-3xl shadow-sm">➕</span>
              {t('tracker.newBusiness')}
            </button>
          </div>
        </>
      )}

      {showNew && (
        <BusinessModal
          open
          onClose={() => setShowNew(false)}
          onSaved={() => {
            businesses.reload()
            report.reload()
          }}
        />
      )}
    </div>
  )
}
