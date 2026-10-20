import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { HiOutlineChatBubbleLeftRight, HiOutlineShoppingCart, HiPlus } from 'react-icons/hi2'
import { Link, NavLink, useLocation } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import LanguageToggle from '../LanguageToggle'
import Logo from '../Logo'

const LINKS = [
  { to: '/', key: 'home', end: true },
  { to: '/products', key: 'market' },
  { to: '/tracker', key: 'tracker' },
]

/** Unread chat messages, refreshed every 30 s and on navigation. */
function useUnreadMessages(enabled) {
  const [count, setCount] = useState(0)
  const { pathname } = useLocation()
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () =>
      api
        .get('/conversations/unread/')
        .then(({ data }) => alive && setCount(data.unread))
        .catch(() => {})
    load()
    const timer = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [enabled, pathname])
  return enabled ? count : 0
}

export default function Navbar() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { cart } = useCart()
  const unread = useUnreadMessages(Boolean(user))

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
          {user && (
            <Link
              to="/messages"
              aria-label={t('chat.title')}
              className="relative grid size-11 place-items-center rounded-full border-2 border-brand-200 bg-white text-brand-800 transition hover:border-brand-400"
            >
              <HiOutlineChatBubbleLeftRight className="size-5" />
              {unread > 0 && (
                <span className="latin absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-xs font-extrabold text-white ring-2 ring-cream">
                  {unread}
                </span>
              )}
            </Link>
          )}
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
