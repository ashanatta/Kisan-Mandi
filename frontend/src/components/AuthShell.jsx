import { useTranslation } from 'react-i18next'
import { HiCheckCircle } from 'react-icons/hi2'

/** Two-panel layout for login / register: green story panel + form card. */
export default function AuthShell({ title, subtitle, children }) {
  const { t } = useTranslation()

  return (
    <div className="container-page py-8 md:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2.5rem] bg-white shadow-xl shadow-brand-900/10 ring-1 ring-stone-200/70 lg:grid-cols-[1fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-brand-900 p-10 text-white lg:block">
          <div aria-hidden className="absolute -start-20 -top-20 size-80 rounded-full bg-brand-500/40 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 -end-10 size-80 rounded-full bg-amber-400/30 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <p className="text-sm font-bold uppercase tracking-widest text-amber-300">{t('brand')}</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight">{t('auth.panelTitle')}</h2>
            <ul className="mt-8 space-y-4">
              {['panel1', 'panel2', 'panel3'].map((key) => (
                <li key={key} className="flex items-start gap-3 text-brand-100">
                  <HiCheckCircle className="mt-0.5 size-6 shrink-0 text-lime-300" />
                  {t(`auth.${key}`)}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-end justify-between pt-10 text-7xl">
              <span className="animate-float">👨‍🌾</span>
              <span className="animate-float-slow">🌾</span>
              <span className="animate-float [animation-delay:1s]">🐄</span>
            </div>
          </div>
        </aside>

        <div className="p-6 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950">{title}</h1>
          {subtitle && <p className="mt-1 text-stone-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  )
}
