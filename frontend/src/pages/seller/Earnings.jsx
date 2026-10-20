import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import useApi from '../../hooks/useApi'
import { formatDate } from '../../utils/dates'
import { formatPrice } from '../../utils/format'

export default function Earnings() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { user } = useAuth()
  const { data } = useApi('/payments/earnings/')

  return (
    <div className="container-page py-8">
      <PageHeader emoji="💰" title={t('earnings.title')} subtitle={t('earnings.subtitle')} />

      {!user.payout_account_number && (
        <Link to="/account" className="mb-5 block rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 font-semibold text-amber-900">
          ⚠️ {t('earnings.addPayoutAccount')}
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard emoji="🔒" label={t('earnings.inEscrow')} value={data ? formatPrice(data.in_escrow) : '—'} sub={t('earnings.inEscrowHint')} />
        <StatCard emoji="⏳" label={t('earnings.toBePaid')} value={data ? formatPrice(data.to_be_paid) : '—'} sub={t('earnings.toBePaidHint')} tone="expense" />
        <StatCard emoji="💸" label={t('earnings.paidOut')} value={data ? formatPrice(data.paid_out) : '—'} tone="profit" />
      </div>

      <section className="card mt-6 overflow-hidden">
        <h2 className="p-5 text-lg font-extrabold text-brand-950 sm:px-6">{t('earnings.payouts')}</h2>
        {data?.payouts.length === 0 ? (
          <p className="px-6 pb-6 text-stone-500">{t('earnings.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-5 py-3 text-start font-bold">{t('earnings.order')}</th>
                  <th className="px-5 py-3 text-end font-bold">{t('escrow.sale')}</th>
                  <th className="px-5 py-3 text-end font-bold">{t('escrow.commission')}</th>
                  <th className="px-5 py-3 text-end font-bold">{t('escrow.youGet')}</th>
                  <th className="px-5 py-3 text-start font-bold">{t('earnings.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data?.payouts.map((p) => (
                  <tr key={p.order_number}>
                    <td className="latin px-5 py-3 font-bold text-stone-800">{p.order_number}</td>
                    <td className="latin px-5 py-3 text-end">{formatPrice(p.gross)}</td>
                    <td className="latin px-5 py-3 text-end text-stone-500">{formatPrice(p.commission)}</td>
                    <td className="latin px-5 py-3 text-end font-extrabold text-brand-700">{formatPrice(p.net)}</td>
                    <td className="px-5 py-3">
                      {p.status === 'paid'
                        ? `💸 ${t('escrow.payoutPaid')} · ${formatDate(p.paid_at?.slice(0, 10), lang)}`
                        : `⏳ ${t('escrow.payoutPending')}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
