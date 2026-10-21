import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiChevronLeft, HiMinus, HiOutlineDocumentChartBar, HiOutlinePencilSquare, HiOutlineTrash, HiPlus } from 'react-icons/hi2'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import { ExpenseBreakdown, IncomeExpenseChart, Legend, ProfitTrendChart } from '../../components/charts'
import EmptyState from '../../components/EmptyState'
import useApi from '../../hooks/useApi'
import { formatDate } from '../../utils/dates'
import { parseApiError } from '../../utils/errors'
import { formatPrice } from '../../utils/format'
import { BUSINESS_TYPES, CHART, EXPENSE_CATEGORIES, INCOME_SOURCES } from '../../utils/labels'
import { Totals } from './TrackerDashboard'
import { BusinessModal, EntryModal } from './TrackerForms'

function EntryList({ kind, businessId, onChanged }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const isExpense = kind === 'expense'
  const list = useApi(isExpense ? '/tracker/expenses/' : '/tracker/incomes/', { business: businessId, page_size: 50 })
  const [editing, setEditing] = useState(null)
  const rows = list.data?.results ?? []

  const remove = async (entry) => {
    if (!window.confirm(t('tracker.confirmDeleteEntry'))) return
    try {
      await api.delete(`/tracker/${isExpense ? 'expenses' : 'incomes'}/${entry.id}/`)
      toast.success(t('listings.deleted'))
      list.reload()
      onChanged()
    } catch (err) {
      toast.error(parseApiError(err).message)
    }
  }

  if (list.loading) return <div className="h-40 animate-pulse rounded-3xl bg-stone-200/60" />
  if (rows.length === 0) return <p className="py-10 text-center text-stone-500">{isExpense ? t('tracker.noExpenses') : t('tracker.noIncome')}</p>

  return (
    <>
      <ul className="divide-y divide-stone-100">
        {rows.map((e) => {
          const key = isExpense ? e.category : e.source
          return (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${isExpense ? 'bg-orange-50' : 'bg-emerald-50'}`}>
                {isExpense ? EXPENSE_CATEGORIES[key] : INCOME_SOURCES[key]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-stone-800">
                  {t(`${isExpense ? 'expenseCats' : 'incomeSources'}.${key}`)}
                  {e.from_marketplace && <span className="ms-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">🛒 {t('tracker.fromMarketplace')}</span>}
                </p>
                <p className="truncate text-sm text-stone-500">
                  {formatDate(e.date, lang)}
                  {e.notes && ` · ${e.notes}`}
                </p>
              </div>
              <span className={`latin shrink-0 font-extrabold ${isExpense ? 'text-orange-700' : 'text-emerald-700'}`}>
                {isExpense ? '−' : '+'} {formatPrice(e.amount)}
              </span>
              <div className="flex shrink-0">
                <button type="button" aria-label={t('listings.edit')} onClick={() => setEditing(e)} className="grid size-10 place-items-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                  <HiOutlinePencilSquare className="size-5" />
                </button>
                <button type="button" aria-label={t('listings.delete')} onClick={() => remove(e)} className="grid size-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600">
                  <HiOutlineTrash className="size-5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {editing && (
        <EntryModal
          key={editing.id}
          open
          kind={kind}
          businessId={businessId}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            list.reload()
            onChanged()
          }}
        />
      )}
    </>
  )
}

export default function BusinessDetail() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const navigate = useNavigate()
  const business = useApi(`/tracker/businesses/${id}/`)
  const report = useApi('/tracker/report/', { business: id })
  const [tab, setTab] = useState('expense')
  const [adding, setAdding] = useState(null) // 'expense' | 'income'
  const [editing, setEditing] = useState(false)
  const [listKey, setListKey] = useState(0)

  const refresh = () => {
    business.reload()
    report.reload()
  }

  const remove = async () => {
    if (!window.confirm(t('tracker.confirmDeleteBusiness', { name: business.data.name }))) return
    try {
      await api.delete(`/tracker/businesses/${id}/`)
      toast.success(t('listings.deleted'))
      navigate('/tracker')
    } catch (err) {
      toast.error(parseApiError(err).message)
    }
  }

  if (business.error) {
    return (
      <div className="container-page py-10">
        <EmptyState emoji="🍂" title={t('tracker.notFound')} action={<Link to="/tracker" className="btn-primary">{t('nav.tracker')}</Link>} />
      </div>
    )
  }

  const b = business.data
  const r = report.data

  return (
    <div className="container-page py-8">
      <Link to="/tracker" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-stone-500 hover:text-brand-700">
        <HiChevronLeft className="size-4 rtl:rotate-180" /> {t('nav.tracker')}
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-brand-100 text-4xl">{b ? BUSINESS_TYPES[b.business_type] : '🌱'}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950">{b?.name ?? '…'}</h1>
          {b && (
            <p className="mt-1 text-stone-600">
              {t(`bizTypes.${b.business_type}`)} · {t(`seasons.${b.season}`)}
              {b.area_acres && ` · ${Number(b.area_acres)} ${t('rent.acre')}`} · {formatDate(b.start_date, lang)}
              {b.end_date ? ` – ${formatDate(b.end_date, lang)}` : ` – ${t('tracker.ongoing')}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/tracker/forecast?business=${id}`} className="btn-ghost min-h-11 px-3" title={t('forecast.title')}>
            🔮 <span className="hidden sm:inline">{t('forecast.short')}</span>
          </Link>
          <Link to={`/tracker/reports?business=${id}`} className="btn-ghost min-h-11 px-3" title={t('tracker.reports')}>
            <HiOutlineDocumentChartBar className="size-5" />
          </Link>
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost min-h-11 px-3" title={t('listings.edit')}>
            <HiOutlinePencilSquare className="size-5" />
          </button>
          <button type="button" onClick={remove} className="btn min-h-11 px-3 text-red-700 hover:bg-red-50" title={t('listings.delete')}>
            <HiOutlineTrash className="size-5" />
          </button>
        </div>
      </div>

      {/* Big quick-add buttons */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setAdding('expense')} className="btn min-h-16 bg-orange-600 text-lg text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700">
          <HiMinus className="size-6" /> {t('tracker.addExpense')}
        </button>
        <button type="button" onClick={() => setAdding('income')} className="btn-primary min-h-16 text-lg">
          <HiPlus className="size-6" /> {t('tracker.addIncome')}
        </button>
      </div>

      <Totals totals={r?.totals} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-brand-950">{t('tracker.monthly')}</h2>
            <Legend items={[[t('tracker.income'), CHART.income], [t('tracker.expense'), CHART.expense]]} />
          </div>
          {r?.by_month.length ? <IncomeExpenseChart data={r.by_month} height={240} /> : <p className="py-16 text-center text-stone-500">{t('tracker.noData')}</p>}
        </section>
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-extrabold text-brand-950">{t('tracker.profitTrend')}</h2>
          {r?.by_month.length ? <ProfitTrendChart data={r.by_month} /> : <p className="py-16 text-center text-stone-500">{t('tracker.noData')}</p>}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-extrabold text-brand-950">{t('tracker.whereMoneyWent')}</h2>
          {r && <ExpenseBreakdown data={r.expense_by_category} />}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-2 flex rounded-2xl bg-stone-100 p-1">
            {['expense', 'income'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`min-h-11 flex-1 rounded-xl font-bold transition ${tab === k ? 'bg-white text-brand-900 shadow' : 'text-stone-500'}`}
              >
                {k === 'expense' ? `🧾 ${t('tracker.expenses')}` : `💰 ${t('tracker.incomes')}`}
              </button>
            ))}
          </div>
          <EntryList key={`${tab}-${listKey}`} kind={tab} businessId={id} onChanged={refresh} />
        </section>
      </div>

      {adding && (
        <EntryModal
          open
          kind={adding}
          businessId={id}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setTab(adding)
            setListKey((k) => k + 1)
            refresh()
          }}
        />
      )}
      {editing && b && <BusinessModal open business={b} onClose={() => setEditing(false)} onSaved={refresh} />}
    </div>
  )
}
