import { HiStar } from 'react-icons/hi2'

export default function Stars({ value = 0, size = 'size-4' }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <HiStar key={n} className={`${size} ${n <= Math.round(value) ? 'text-amber-400' : 'text-stone-200'}`} />
      ))}
    </span>
  )
}
