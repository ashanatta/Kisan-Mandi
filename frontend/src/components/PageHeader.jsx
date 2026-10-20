/** Page title row with optional back link slot and actions on the end side. */
export default function PageHeader({ emoji, title, subtitle, actions, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {children}
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-950 sm:text-4xl">
          {emoji && <span className="me-2">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-stone-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
