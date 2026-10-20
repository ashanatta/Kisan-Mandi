import { useTranslation } from 'react-i18next'
import { HiOutlineShoppingCart, HiPlus } from 'react-icons/hi2'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import LanguageToggle from '../LanguageToggle'
import Logo from '../Logo'

const LINKS = [
  { to: '/', key: 'home', end: true },
  { to: '/products', key: 'market' },
  { to: '/tracker', key: 'tracker' },
]

export default function Navbar() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { cart } = useCart()

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100/80 bg-cream/85 backdrop-blur-md">
      <nav className="container-page flex h-16 items-center justify-between gap-4 md:h-20">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(({ to, key, end }) => (
            <NavLink
              key={key}
              to={to}
              end={end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-[15px] font-semibold transition ${
                  isActive ? 'bg-brand-100 text-brand-900' : 'text-stone-600 hover:bg-white hover:text-brand-800'
                }`
              }
            >
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link
            to="/cart"
            aria-label={t('nav.cart')}
            className="relative grid size-11 place-items-center rounded-full border-2 border-brand-200 bg-white text-brand-800 transition hover:border-brand-400"
          >
            <HiOutlineShoppingCart className="size-5" />
            {cart.count > 0 && (
              <span className="latin absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-xs font-extrabold text-brand-950 ring-2 ring-cream">
                {cart.count}
              </span>
            )}
          </Link>
          {user ? (
            <Link
              to="/account"
              title={user.full_name}
              className="flex items-center gap-2 rounded-full border-2 border-brand-200 bg-white p-0.5 pe-0.5 transition hover:border-brand-400 lg:pe-4"
            >
              <span className="latin grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-extrabold text-white">
                {(user.first_name || user.username)[0].toUpperCase()}
              </span>
              <span className="hidden max-w-28 truncate text-sm font-bold text-brand-900 lg:block">
                {user.first_name || user.username}
              </span>
            </Link>
          ) : (
            <Link to="/login" className="btn-ghost hidden lg:inline-flex">
              {t('nav.login')}
            </Link>
          )}
          <Link to="/sell" className="btn-accent hidden md:inline-flex">
            <HiPlus className="size-5" />
            {t('nav.sell')}
          </Link>
        </div>
      </nav>
    </header>
  )
}
