import { useTranslation } from 'react-i18next'

const TIPS = ['tip1', 'tip2', 'tip3', 'tip4']
const ANIMAL_TIP = 'tipAnimal'

/** Practical safety advice shown next to every listing. */
export default function SafetyTips({ kind }) {
  const { t } = useTranslation()
  const tips = kind === 'livestock' ? [ANIMAL_TIP, ...TIPS] : TIPS
  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
      <h2 className="font-extrabold text-amber-950">🛡️ {t('trust.safetyTitle')}</h2>
      <ul className="mt-3 space-y-2 text-sm text-amber-900">
        {tips.map((key) => (
          <li key={key} className="flex gap-2">
            <span aria-hidden>•</span>
            {t(`trust.${key}`)}
          </li>
        ))}
      </ul>
    </section>
  )
}
