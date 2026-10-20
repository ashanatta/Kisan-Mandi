import { useTranslation } from 'react-i18next'
import { HiOutlineShieldCheck } from 'react-icons/hi2'

/** Explains escrow in three steps – shown at checkout and on the payment page. */
export default function ProtectionBanner({ days = 3 }) {
  const { t } = useTranslation()
  return (
    <section className="overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-sky-50">
      <div className="flex items-center gap-3 border-b border-brand-100 px-5 py-4">
        <HiOutlineShieldCheck className="size-8 shrink-0 text-brand-700" />
        <div>
          <h2 className="font-extrabold text-brand-950">{t('escrow.title')}</h2>
          <p className="text-sm text-stone-600">{t('escrow.subtitle')}</p>
        </div>
      </div>
      <ol className="grid gap-3 p-5 sm:grid-cols-3">
        {[
          ['💳', 'step1'],
          ['🔒', 'step2'],
          ['✅', 'step3'],
        ].map(([emoji, key], i) => (
          <li key={key} className="flex gap-3 sm:flex-col">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-xl shadow-sm">{emoji}</span>
            <p className="text-sm text-stone-700">
              <b className="latin text-brand-800">{i + 1}.</b> {t(`escrow.${key}`, { days })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
