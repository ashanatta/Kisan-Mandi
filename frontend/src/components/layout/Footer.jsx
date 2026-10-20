import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Logo from '../Logo'

const YEAR = new Date().getFullYear()

export default function Footer() {
  const { t } = useTranslation()

  const columns = [
    {
      title: t('footer.market'),
      links: [
        ['/products?kind=crop', '🌾 ' + t('nav.market')],
        ['/products?kind=livestock', '🐄 ' + t('home.livestockTitle')],
        ['/sell', '➕ ' + t('nav.sell')],
      ],
    },
    {
      title: t('footer.tools'),
      links: [
        ['/tracker', '📊 ' + t('nav.tracker')],
        ['/cart', '🛒 ' + t('nav.cart')],
      ],
    },
    {
      title: t('footer.help'),
      links: [
        ['/login', t('nav.login')],
        ['/register', t('nav.register')],
      ],
    },
  ]

  return (
    <footer className="relative mt-20 overflow-hidden bg-brand-950 text-brand-100">
      <div aria-hidden className="pointer-events-none absolute -end-10 -top-10 select-none text-[12rem] opacity-[0.06]">
        🌾
      </div>
      <div className="container-page relative grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-brand-200/90">{t('footer.about')}</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="font-bold text-white">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="text-brand-200/90 transition hover:text-amber-300">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="container-page py-5 text-sm text-brand-300">
          © <span className="latin">{YEAR}</span> {t('brand')}. {t('footer.rights')}
        </p>
      </div>
    </footer>
  )
}
