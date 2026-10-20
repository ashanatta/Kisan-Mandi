import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiChevronLeft, HiOutlineArrowDownTray } from 'react-icons/hi2'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { ExpenseBreakdown, IncomeExpenseChart, Legend, ProfitTrendChart } from '../../components/charts'
import PageHeader from '../../components/PageHeader'
import useApi from '../../hooks/useApi'
import { RANGE_KEYS, rangePresets } from '../../utils/dates'
import { formatPrice } from '../../utils/format'
import { BUSINESS_TYPES, CHART, INCOME_SOURCES } from '../../utils/labels'
import { RangeChips, Totals } from './TrackerDashboard'

function Money({ value }) {
  const n = Number(value)
  return <span className={`latin font-semibold ${n < 0 ? 'text-red-700' : ''}`}>{formatPrice(n)}</span>
}

export default function Reports() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState('thisYear')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [downloading, setDownloading] = useState(null)
  const businessId = searchParams.get('business') ?? ''

  const { start, end } = range === 'custom' ? custom : rangePresets()[range]
  const params = { start: start || undefined, end: end || undefined, business: businessId || undefined }
  const businesses = useApi('/tracker/businesses/')
  const report = useApi('/tracker/report/', params)
  const r = report.data

  const download = async (file) => {
    setDownloading(file)
    try {
      const { data } = await api.get('/tracker/report/export/', { params: { ...params, file }, responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `profit-loss-${start || 'all'}-${end || 'today'}.${file}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('tracker.downloadFailed'))
    } finally {
      setDownloading(null)
    }
  }

  const monthName = (m) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(y, mo - 1, 1).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="container-page py-8">
      <PageHeader
        emoji="📑"
        title={t('tracker.reports')}
        subtitle={t('tracker.reportsSubtitle')}
        actions={
          <>
            <button type="button" disabled={Boolean(downloading)} onClick={() => download('pdf')} className="btn-outline">
              <HiOutlineArrowDownTray className="size-5" /> {downloading === 'pdf' ? '…' : 'PDF'}
            </button>
            <button type="button" disabled={Boolean(downloading)} onClick={() => download('xlsx')} className="btn-primary">
              <HiOutlineArrowDownTray className="size-5" /> {downloading === 'xlsx' ? '…' : 'Excel'}
            </button>
          </>
        }
      >
        <Link to="/tracker" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-stone-500 hover:text-brand-700">
          <HiChevronLeft className="size-4 rtl:rotate-180" /> {t('nav.tracker')}
        </Link>
      </PageHeader>

      {/* Filters – one row above the charts */}
      <div className="card mb-6 space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="biz" className="text-sm font-bold text-stone-700">{t('tracker.business')}</label>
          <select
            id="biz"
            value={businessId}
            onChange={(e) => setSearchParams(e.target.value ? { business: e.target.value } : {})}
            className="input min-h-11 w-auto min-w-56 cursor-pointer"
          >
            <option value="">{t('tracker.allBusinesses')}</option>
            {businesses.data?.map((b) => (
              <option key={b.id} value={b.id}>{BUSINESS_TYPES[b.business_type]} {b.name}</option>
            ))}
          </select>
        </div>
        <RangeChips value={range} onChange={setRange} keys={[...RANGE_KEYS, 'custom']} />
        {range === 'custom' && (
          <div className="flex flex-wrap items-center gap-3">
            <input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="input w-auto" aria-label={t('tracker.startDate')} />
            <span className="text-stone-400">→</span>
            <input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="input w-auto" aria-label={t('tracker.endDate')} />
          </div>
        )}
      </div>

      {report.error ? (
        <p className="card p-6 text-center font-semibold text-red-700">{report.error.response?.data?.detail ?? t('products.error')}</p>
      ) : (
        <>
          <Totals totals={r?.totals} />

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-brand-950">{t('tracker.monthly')}</h2>
                <Legend items={[[t('tracker.income'), CHART.income], [t('tracker.expense'), CHART.expense]]} />
              </div>
              {r?.by_month.length ? <IncomeExpenseChart data={r.by_month} /> : <p className="py-16 text-center text-stone-500">{t('tracker.noData')}</p>}
            </section>
            <section className="card p-5 sm:p-6">
              <h2 className="mb-4 text-lg font-extrabold text-brand-950">{t('tracker.profitTrend')}</h2>
              {r?.by_month.length ? <ProfitTrendChart data={r.by_month} height={280} /> : <p className="py-16 text-center text-stone-500">{t('tracker.noData')}</p>}
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card p-5 sm:p-6">
              <h2 className="mb-4 text-lg font-extrabold text-brand-950">{t('tracker.whereMoneyWent')}</h2>
              {r && <ExpenseBreakdown data={r.expense_by_category} />}
            </section>
            <section className="card p-5 sm:p-6">
              <h2 className="mb-4 text-lg font-extrabold text-brand-950">{t('tracker.incomeSources')}</h2>
              {r?.income_by_source.length ? (
                <ul className="space-y-3">
                  {r.income_by_source.map((s) => {
                    const share = (Number(s.amount) * 100) / Number(r.totals.income || 1)
                    return (
                      <li key={s.source}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-semibold text-stone-700">{INCOME_SOURCES[s.source]} {t(`incomeSources.${s.source}`)}</span>
                          <span className="latin font-bold text-stone-900">{formatPrice(s.amount)} <span className="text-xs text-stone-500">({share.toFixed(0)}%)</span></span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
                          <div className="h-full rounded-full" style={{ width: `${share}%`, background: CHART.income }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="py-10 text-center text-stone-500">{t('tracker.noIncome')}</p>
              )}
            </section>
          </div>

          {/* Table views */}
          {r?.by_business.length > 0 && (
            <section className="card mt-6 overflow-hidden">
              <h2 className="p-5 text-lg font-extrabold text-brand-950 sm:px-6">{t('tracker.byBusiness')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="px-5 py-3 text-start font-bold">{t('tracker.business')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.income')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.expense')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.profit')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {r.by_business.map((b) => (
                      <tr key={b.id}>
                        <td className="px-5 py-3 font-bold text-stone-800">
                          <Link to={`/tracker/${b.id}`} className="hover:text-brand-700">{BUSINESS_TYPES[b.business_type]} {b.name}</Link>
                        </td>
                        <td className="px-5 py-3 text-end"><Money value={b.income} /></td>
                        <td className="px-5 py-3 text-end"><Money value={b.expense} /></td>
                        <td className="px-5 py-3 text-end font-extrabold"><Money value={b.profit} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {r?.by_month.length > 0 && (
            <section className="card mt-6 overflow-hidden">
              <h2 className="p-5 text-lg font-extrabold text-brand-950 sm:px-6">{t('tracker.monthlyTable')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="px-5 py-3 text-start font-bold">{t('tracker.month')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.income')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.expense')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.profit')}</th>
                      <th className="px-5 py-3 text-end font-bold">{t('tracker.cumulativeProfit')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 tabular-nums">
                    {r.by_month.map((m) => (
                      <tr key={m.month}>
                        <td className="px-5 py-3 font-semibold text-stone-700">{monthName(m.month)}</td>
                        <td className="px-5 py-3 text-end"><Money value={m.income} /></td>
                        <td className="px-5 py-3 text-end"><Money value={m.expense} /></td>
                        <td className="px-5 py-3 text-end"><Money value={m.profit} /></td>
                        <td className="px-5 py-3 text-end font-bold"><Money value={m.cumulative_profit} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
