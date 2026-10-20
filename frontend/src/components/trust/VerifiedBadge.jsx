import { useTranslation } from 'react-i18next'
import { HiCheckBadge } from 'react-icons/hi2'

/** Blue check shown for sellers whose CNIC an admin has verified. */
export default function VerifiedBadge({ size = 'md', className = '' }) {
  const { t } = useTranslation()
  if (size === 'icon') {
    return <HiCheckBadge className={`size-5 shrink-0 text-sky-600 ${className}`} title={t('trust.verifiedSeller')} aria-label={t('trust.verifiedSeller')} />
  }
  return (
    <span
      title={t('trust.verifiedHint')}
      className={`inline-flex items-center gap-1 rounded-full bg-sky-100 font-bold text-sky-800 ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${className}`}
    >
      <HiCheckBadge className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {t('trust.verifiedSeller')}
    </span>
  )
}
