import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPrice } from '../utils/format'
import { CHART, EXPENSE_CATEGORIES, categoryColor } from '../utils/labels'

const tick = { fill: CHART.axis, fontSize: 12 }
const tooltipStyle = { borderRadius: 16, border: '1px solid #e7e5e4', boxShadow: '0 8px 24px rgba(0,0,0,.08)' }

/** "2026-03" → "Mar 26" */
function monthLabel(value, lang) {
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', { month: 'short', year: '2-digit' })
}

/** Compact axis numbers: 1,250,000 → 12.5L */
function shortAxis(v) {
  const n = Math.abs(v)
  if (n >= 1e7) return `${+(v / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `${+(v / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `${+(v / 1e3).toFixed(0)}k`
  return v
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-stone-600">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="size-3 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}

/** Monthly income vs expense bars. */
export function IncomeExpenseChart({ data, height = 280 }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const rows = data.map((d) => ({ ...d, income: Number(d.income), expense: Number(d.expense) }))

  return (
    <div className="latin" dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} tickFormatter={(v) => monthLabel(v, lang)} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={tick} tickFormatter={shortAxis} />
          <Tooltip
            cursor={{ fill: '#f0f9f1' }}
            contentStyle={tooltipStyle}
            labelFormatter={(v) => monthLabel(v, lang)}
            formatter={(value, name) => [formatPrice(value), t(`tracker.${name}`)]}
          />
          <Bar dataKey="income" fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="expense" fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Running profit over time; the line sits above or below the zero baseline. */
export function ProfitTrendChart({ data, height = 240 }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const rows = data.map((d) => ({ month: d.month, value: Number(d.cumulative_profit) }))
  const last = rows.at(-1)?.value ?? 0
  const color = last >= 0 ? CHART.profit : CHART.loss

  return (
    <div className="latin" dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} tickFormatter={(v) => monthLabel(v, lang)} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={tick} tickFormatter={shortAxis} />
          <ReferenceLine y={0} stroke="#a8a29e" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => monthLabel(v, lang)}
            formatter={(value) => [formatPrice(value), t('tracker.cumulativeProfit')]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#profitFill)" dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Expense breakdown donut with a labelled list (label + amount + share),
 * so categories are never identified by colour alone.
 */
export function ExpenseBreakdown({ data }) {
  const { t } = useTranslation()
  const total = data.reduce((s, d) => s + Number(d.amount), 0)
  if (!total) return <p className="py-10 text-center text-stone-500">{t('tracker.noExpenses')}</p>

  // Categories without a fixed colour fold into one "Other" slice.
  const slices = []
  let other = 0
  data.forEach((d) => {
    const color = categoryColor(d.category)
    if (color === CHART.other) other += Number(d.amount)
    else slices.push({ key: d.category, label: t(`expenseCats.${d.category}`), emoji: EXPENSE_CATEGORIES[d.category], amount: Number(d.amount), color })
  })
  if (other) slices.push({ key: 'other-group', label: t('tracker.otherGroup'), emoji: '➕', amount: other, color: CHART.other })

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
      <div className="relative mx-auto size-[200px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="amount" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={1.5} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatPrice(value), name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xs font-semibold text-stone-500">{t('tracker.expense')}</p>
            <p className="latin text-lg font-extrabold text-stone-900">{shortAxis(total)}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-3">
            <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate font-semibold text-stone-700">
              {s.emoji} {s.label}
            </span>
            <span className="latin text-sm font-bold text-stone-900">{formatPrice(s.amount)}</span>
            <span className="latin w-12 text-end text-xs font-semibold text-stone-500">{((s.amount * 100) / total).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
