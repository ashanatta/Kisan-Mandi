import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="container-page grid min-h-[60svh] place-items-center py-16 text-center">
      <div>
        <p className="latin text-8xl font-extrabold text-brand-200">404</p>
        <p className="mt-2 text-5xl">🏜️</p>
        <h1 className="mt-4 text-3xl font-extrabold text-brand-950">{t('notFound.title')}</h1>
        <p className="mt-2 text-stone-600">{t('notFound.text')}</p>
        <Link to="/products" className="btn-primary mt-8">
          {t('nav.market')}
        </Link>
      </div>
    </div>
  )
}
