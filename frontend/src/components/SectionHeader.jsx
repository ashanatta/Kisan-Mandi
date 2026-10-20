import { HiArrowRight } from 'react-icons/hi2'
import { Link } from 'react-router-dom'

export default function SectionHeader({ title, subtitle, linkTo, linkLabel }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-1 text-stone-500">{subtitle}</p>}
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="group inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700 hover:text-brand-900"
        >
          {linkLabel}
          <HiArrowRight className="size-4 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
        </Link>
      )}
    </div>
  )
}
