import { useTranslation } from 'react-i18next'
import {
  HiOutlineBuildingStorefront,
  HiOutlineChartBar,
  HiOutlineHome,
  HiOutlineUserCircle,
  HiPlus,
} from 'react-icons/hi2'
import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', key: 'home', Icon: HiOutlineHome, end: true },
  { to: '/products', key: 'market', Icon: HiOutlineBuildingStorefront },
  { to: '/sell', key: 'sell', Icon: HiPlus, primary: true },
  { to: '/tracker', key: 'tracker', Icon: HiOutlineChartBar },
  { to: '/account', key: 'account', Icon: HiOutlineUserCircle },
]

/** App-style bottom navigation for phones. */
export default function MobileTabBar() {
  const { t } = useTranslation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {TABS.map(({ to, key, Icon, end, primary }) => (
          <li key={key}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  isActive ? 'text-brand-700' : 'text-stone-500'
                }`
              }
            >
              {primary ? (
                <span className="-mt-7 grid size-14 place-items-center rounded-full bg-amber-400 text-brand-950 shadow-lg shadow-amber-500/40 ring-4 ring-white">
                  <Icon className="size-7" />
                </span>
              ) : (
                <Icon className="size-6" />
              )}
              {/* First word only so labels fit, e.g. "Expense Tracker" → "Expense" */}
              <span className="leading-tight">{t(`nav.${key}`).split(' ')[0]}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
