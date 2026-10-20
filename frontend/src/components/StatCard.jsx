/** Big number tile. `tone` colours the value: income, expense, profit, loss or neutral. */
const TONES = {
  neutral: 'text-brand-950',
  income: 'text-emerald-700',
  expense: 'text-orange-700',
  profit: 'text-brand-700',
  loss: 'text-red-700',
}

export default function StatCard({ emoji, label, value, sub, tone = 'neutral', className = '' }) {
  return (
    <div className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-500">
        {emoji && <span className="text-lg">{emoji}</span>}
        {label}
      </div>
      <p className={`latin mt-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl ${TONES[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-sm text-stone-500">{sub}</p>}
    </div>
  )
}
