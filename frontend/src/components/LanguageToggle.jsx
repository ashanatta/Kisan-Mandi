import { useTranslation } from 'react-i18next'

export default function LanguageToggle({ className = '' }) {
  const { i18n, t } = useTranslation()
  const current = i18n.resolvedLanguage

  return (
    <div
      role="group"
      aria-label={t('language')}
      className={`flex rounded-full border-2 border-brand-200 bg-white p-0.5 text-sm font-bold ${className}`}
    >
      {[
        ['en', 'EN'],
        ['ur', 'اردو'],
      ].map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          aria-pressed={current === code}
          className={`min-h-9 rounded-full px-3 transition ${
            current === code ? 'bg-brand-600 text-white shadow' : 'text-brand-800 hover:bg-brand-50'
          } ${code === 'ur' ? 'font-urdu text-xs' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
