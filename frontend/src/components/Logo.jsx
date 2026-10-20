import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function Logo({ light = false }) {
  const { t } = useTranslation()
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-10 shrink-0 rounded-xl shadow-md" />
      <span className="leading-tight">
        <span className={`block text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-brand-900'}`}>
          {t('brand')}
        </span>
        <span className={`hidden text-xs font-medium sm:block ${light ? 'text-brand-200' : 'text-brand-600'}`}>
          {t('brandTagline')}
        </span>
      </span>
    </Link>
  )
}
