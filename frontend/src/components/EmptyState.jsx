export default function EmptyState({ emoji = '🌾', title, text, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-24 place-items-center rounded-full bg-brand-50 text-5xl">{emoji}</div>
      <h3 className="mt-5 text-xl font-bold text-brand-950">{title}</h3>
      {text && <p className="mt-2 max-w-md text-stone-500">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
