import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/** `inNav`: hide the tagline on large-but-not-wide screens, where the nav links need the room. */
export default function Logo({ light = false, inNav = false }) {
  const { t } = useTranslation()
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5 lg:shrink-0">
      <img src="/favicon.svg" alt="" className="size-10 shrink-0 rounded-xl shadow-md" />
      <span className="leading-tight lg:whitespace-nowrap">
        <span className={`block text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-brand-900'}`}>
          {t('brand')}
        </span>
        <span className={`hidden text-xs font-medium sm:block ${inNav ? 'lg:hidden xl:block' : ''} ${light ? 'text-brand-200' : 'text-brand-600'}`}>
          {t('brandTagline')}
        </span>
      </span>
    </Link>
  )
}
