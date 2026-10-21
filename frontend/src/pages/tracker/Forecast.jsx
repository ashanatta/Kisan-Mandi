import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiArrowTopRightOnSquare, HiChevronLeft } from 'react-icons/hi2'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { IncomeExpenseChart, Legend } from '../../components/charts'
import PageHeader from '../../components/PageHeader'
import useApi from '../../hooks/useApi'
import { formatDate } from '../../utils/dates'
import { parseApiError } from '../../utils/errors'
import { formatNumber, formatShortPrice, timeAgo } from '../../utils/format'
import { BUSINESS_TYPES, CHART, EXPENSE_CATEGORIES, INCOME_SOURCES } from '../../utils/labels'

const GROUPS = ['input', 'mandi', 'world', 'economy']

function signedShort(value) {
  const n = Number(value)
  return `${n < 0 ? '−' : ''}${formatShortPrice(Math.abs(n))}`
}

function ChangeBadge({ pct, invert = false }) {
  if (pct == null) return <span className="text-xs text-stone-400">—</span>
  // For costs a rise is bad (red); for income and crop prices a rise is good (green).
  const good = invert ? pct <= 0 : pct >= 0
  return (
    <span className={`latin inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${pct === 0 ? 'bg-stone-100 text-stone-600' : good ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`} dir="ltr">
      {pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct)}%
    </span>
  )
}

function ScenarioCard({ kind, scenario, highlight = false }) {
  const { t } = useTranslation()
  const profit = Number(scenario.profit)
  const styles = { bad: 'bg-red-50', expected: 'bg-brand-50 ring-2 ring-brand-300', good: 'bg-emerald-50' }
  return (
    <div className={`card p-4 sm:p-5 ${styles[kind]} ${highlight ? 'sm:-my-2' : ''}`}>
      <p className="text-sm font-bold text-stone-600">{t(`forecast.${kind}`)}</p>
      <p className={`latin mt-1 text-2xl font-extrabold sm:text-3xl ${profit >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
        {profit >= 0 ? '▲' : '▼'} {formatShortPrice(Math.abs(profit))}
      </p>
      <p className="text-sm font-semibold text-stone-500">{profit >= 0 ? t('tracker.profit') : t('tracker.loss')}</p>
      <p className="latin mt-2 text-xs text-stone-500">
        💰 {formatShortPrice(scenario.income)} · 🧾 {formatShortPrice(scenario.expense)}
      </p>
    </div>
  )
}

function Lines({ lines, kind, priceNames }) {
  const { t } = useTranslation()
  const isExpense = kind === 'expense'
  if (!lines.length) return null
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-extrabold text-brand-950">{isExpense ? `🧾 ${t('forecast.costLines')}` : `💰 ${t('forecast.incomeLines')}`}</h2>
      <p className="mb-3 text-sm text-stone-500">{t('forecast.linesHint')}</p>
      <ul className="divide-y divide-stone-100">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center gap-3 py-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-xl ${isExpense ? 'bg-orange-50' : 'bg-emerald-50'}`}>
              {isExpense ? EXPENSE_CATEGORIES[line.key] : INCOME_SOURCES[line.key]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-stone-800">{t(`${isExpense ? 'expenseCats' : 'incomeSources'}.${line.key}`)}</p>
              <p className="truncate text-xs text-stone-500">
                {line.drivers.length ? `${t('forecast.followsPrice')}: ${line.drivers.map((d) => priceNames[d] || d).join(' + ')}` : t('forecast.noChange')}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className="latin font-extrabold text-stone-900">{formatShortPrice(line.next)}</p>
              <p className="latin text-xs text-stone-400 line-through">{formatShortPrice(line.base)}</p>
            </div>
            <div className="w-20 shrink-0 text-end"><ChangeBadge pct={line.change_pct} invert={isExpense} /></div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Advice({ business, enabled, enoughData }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'ur' ? 'ur' : 'en'
  const [state, setState] = useState({ loading: false, text: '', error: '' })

  const ask = async () => {
    setState({ loading: true, text: '', error: '' })
    try {
      const { data } = await api.get('/insights/forecast/advice/', { params: { business: business || undefined, lang }, timeout: 90000 })
      setState({ loading: false, text: data.text, error: '' })
    } catch (err) {
      const { message, fields } = parseApiError(err)
      setState({ loading: false, text: '', error: message || Object.values(fields)[0] })
    }
  }

  return (
    <section className="card bg-gradient-to-br from-sky-50 to-white p-5 sm:p-6">
      <h2 className="text-lg font-extrabold text-brand-950">🤖 {t('forecast.adviceTitle')}</h2>
      {!enabled ? (
        <p className="mt-2 text-sm text-stone-500">{t('forecast.adviceOff')}</p>
      ) : state.text ? (
        <div className="mt-3 space-y-2 text-stone-800">
          {state.text.split('\n').filter((l) => l.trim()).map((line, i) => (
            <p key={i} className={line.trim().startsWith('-') ? 'ps-4' : 'font-semibold'}>{line.trim().replace(/^[-*]\s*/, '• ').replace(/\*\*/g, '')}</p>
          ))}
          <p className="pt-2 text-xs text-stone-500">⚠️ {t('forecast.adviceDisclaimer')}</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-stone-600">{t('forecast.adviceIntro')}</p>
          {state.error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{state.error}</p>}
          <button type="button" onClick={ask} disabled={state.loading || !enoughData} className="btn-primary mt-4 w-full sm:w-auto">
            {state.loading ? `⏳ ${t('forecast.adviceLoading')}` : `🤖 ${t('forecast.askAdvice')}`}
          </button>
        </>
      )}
    </section>
  )
}

function MarketPrices({ market }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const prices = market?.prices ?? []
  const updated = prices.map((p) => p.updated_at).sort().at(-1)

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-brand-950">📈 {t('market.pricesTitle')}</h2>
        {market?.refreshing && <span className="animate-pulse text-xs font-semibold text-sky-700">🔄 {t('market.updating')}</span>}
      </div>
      {!prices.length ? (
        <p className="py-6 text-center text-sm text-stone-500">{market?.prices_auto ? t('market.noPricesYet') : t('market.noPrices')}</p>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const rows = prices.filter((p) => p.group === group)
            if (!rows.length) return null
            return (
              <div key={group}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-stone-400">{t(`market.group_${group}`)}</p>
                <ul className="divide-y divide-stone-100">
                  {rows.map((p) => (
                    <li key={p.key} className="flex items-center gap-3 py-2" title={p.note}>
                      <span className="min-w-0 flex-1 truncate font-semibold text-stone-700">{lang === 'ur' ? p.name_ur : p.name}</span>
                      <span className="latin shrink-0 text-end font-bold text-stone-900" dir="ltr">
                        {formatNumber(p.price)} <span className="text-xs font-normal text-stone-500">{p.unit}</span>
                      </span>
                      <span className="w-20 shrink-0 text-end">
                        {p.key === 'cpi' ? null : <ChangeBadge pct={p.change_pct} invert={group === 'input'} />}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <p className="text-xs text-stone-500">
            {updated && `${t('market.updated')} ${timeAgo(updated, lang)} · `}{t('market.disclaimer')}
          </p>
          {market.brief?.sources?.length > 0 && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer font-semibold">{t('market.sources')} ({market.brief.sources.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {market.brief.sources.map((s) => (
                  <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title || s.url}</a></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

function News({ market }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'ur' ? 'ur' : 'en'
  const brief = market?.brief?.[`summary_${lang}`]
  // Urdu farm news is scarce: fill up with English stories.
  let items = market?.news?.[lang] ?? []
  if (lang === 'ur' && items.length < 8) {
    const seen = new Set(items.map((n) => n.url))
    items = items.concat((market?.news?.en ?? []).filter((n) => !seen.has(n.url))).slice(0, 15)
  }

  return (
    <section className="card p-5 sm:p-6">
      {brief && (
        <div className="mb-5 rounded-2xl bg-amber-50 px-4 py-3">
          <p className="text-xs font-bold text-amber-800">🌍 {t('market.worldTitle')}</p>
          <p className="mt-1 text-sm text-amber-950">{brief}</p>
        </div>
      )}
      <h2 className="mb-3 text-lg font-extrabold text-brand-950">📰 {t('market.newsTitle')}</h2>
      {!items.length ? (
        <p className="py-6 text-center text-sm text-stone-500">{t('market.noNews')}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer" className="group flex gap-3 rounded-2xl p-2 hover:bg-stone-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-stone-800 group-hover:text-brand-700">{n.title}</span>
                  <span className="text-xs text-stone-500">{n.source}{n.published_at && ` · ${timeAgo(n.published_at, i18n.resolvedLanguage)}`}</span>
                </span>
                <HiArrowTopRightOnSquare className="mt-1 size-4 shrink-0 text-stone-400 rtl:-scale-x-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Forecast() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const [params, setParams] = useSearchParams()
  const business = params.get('business') || ''
  const businesses = useApi('/tracker/businesses/')
  const forecast = useApi('/insights/forecast/', { business: business || undefined })
  const market = useApi('/insights/market/')
  const f = forecast.data
  const m = market.data

  // A background refresh was started: fetch again once it has had time to finish.
  const { reload } = market
  useEffect(() => {
    if (!m?.refreshing) return
    const timer = setTimeout(reload, 30000)
    return () => clearTimeout(timer)
  }, [m?.refreshing, reload])

  const priceNames = Object.fromEntries((m?.prices ?? []).map((p) => [p.key, lang === 'ur' ? p.name_ur : p.name]))
  priceNames.cpi = priceNames.cpi || t('market.inflation')
  const change = f && Number(f.base.profit) ? ((Number(f.expected.profit) - Number(f.base.profit)) / Math.abs(Number(f.base.profit))) * 100 : null

  return (
    <div className="container-page py-8">
      <Link to={business ? `/tracker/${business}` : '/tracker'} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-stone-500 hover:text-brand-700">
        <HiChevronLeft className="size-4 rtl:rotate-180" /> {t('nav.tracker')}
      </Link>
      <PageHeader emoji="🔮" title={t('forecast.title')} subtitle={t('forecast.subtitle')} />

      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
        {[{ id: '', name: t('forecast.allFarms'), business_type: null }, ...(businesses.data ?? [])].map((b) => (
          <button
            key={b.id || 'all'}
            type="button"
            onClick={() => setParams(b.id ? { business: b.id } : {})}
            className={`chip ${String(b.id) === business ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'}`}
          >
            {b.business_type ? BUSINESS_TYPES[b.business_type] : '🌾'} {b.name}
          </button>
        ))}
      </div>

      {forecast.loading && <div className="h-48 animate-pulse rounded-3xl bg-stone-200/60" />}

      {f && (
        <>
          {!f.enough_data && (
            <p className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-900">📝 {t('forecast.needData', { count: f.data_months })}</p>
          )}

          <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm sm:p-5">
            <p className="text-stone-600">
              {t('forecast.lastYear')} <span className="font-semibold">({formatDate(f.period.base_start, lang)} – {formatDate(f.period.base_end, lang)})</span>:{' '}
              <span className={`latin font-extrabold ${Number(f.base.profit) >= 0 ? 'text-brand-700' : 'text-red-700'}`}>{signedShort(f.base.profit)}</span>
            </p>
            <p className="text-stone-600">
              {t('forecast.nextYear')} <span className="font-semibold">({formatDate(f.period.next_start, lang)} – {formatDate(f.period.next_end, lang)})</span>
              {change != null && <> · <ChangeBadge pct={Math.round(change)} /></>}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ScenarioCard kind="bad" scenario={f.bad} />
            <ScenarioCard kind="expected" scenario={f.expected} highlight />
            <ScenarioCard kind="good" scenario={f.good} />
          </div>
          <p className="mt-3 text-xs text-stone-500">
            ℹ️ {t('forecast.howItWorks')}
            {f.inflation_assumed && ` ${t('forecast.inflationAssumed', { pct: f.inflation_pct })}`}
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-brand-950">📅 {t('forecast.monthly')}</h2>
                <Legend items={[[t('tracker.income'), CHART.income], [t('tracker.expense'), CHART.expense]]} />
              </div>
              {f.by_month.length ? <IncomeExpenseChart data={f.by_month} height={260} /> : <p className="py-16 text-center text-stone-500">{t('tracker.noData')}</p>}
            </section>
            {/* A new business or language needs a new answer, so remount. */}
            <Advice key={`${business}-${lang}`} business={business} enabled={m?.ai_enabled} enoughData={f.enough_data} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Lines lines={f.expense_lines} kind="expense" priceNames={priceNames} />
            <Lines lines={f.income_lines} kind="income" priceNames={priceNames} />
          </div>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <MarketPrices market={m} />
        <News market={m} />
      </div>
    </div>
  )
}
