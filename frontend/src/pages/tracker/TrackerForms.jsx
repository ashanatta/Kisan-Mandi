import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import api from '../../api/client'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { parseApiError } from '../../utils/errors'
import { today } from '../../utils/dates'
import { BUSINESS_TYPES, EXPENSE_CATEGORIES, INCOME_SOURCES, SEASONS } from '../../utils/labels'

function EmojiGrid({ options, value, onChange, labelKey }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {Object.entries(options).map(([key, emoji]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center transition ${
            value === key ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-stone-200 bg-white hover:border-brand-200'
          }`}
        >
          <span className="text-2xl">{emoji}</span>
          <span className="text-xs font-bold leading-tight text-stone-700">{t(`${labelKey}.${key}`)}</span>
        </button>
      ))}
    </div>
  )
}

/** Create or edit a business. */
export function BusinessModal({ open, onClose, business, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => ({
    name: business?.name ?? '',
    business_type: business?.business_type ?? 'crop',
    season: business?.season ?? 'year_round',
    area_acres: business?.area_acres ?? '',
    start_date: business?.start_date ?? today(),
    end_date: business?.end_date ?? '',
    description: business?.description ?? '',
    is_active: business?.is_active ?? true,
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const field = (key) => ({ value: form[key] ?? '', onChange: (e) => setForm({ ...form, [key]: e.target.value }), error: errors[key] })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const body = { ...form, area_acres: form.area_acres || null, end_date: form.end_date || null }
    try {
      const { data } = business
        ? await api.patch(`/tracker/businesses/${business.id}/`, body)
        : await api.post('/tracker/businesses/', body)
      toast.success(t('tracker.businessSaved'))
      onSaved(data)
      onClose()
    } catch (err) {
      const { message, fields } = parseApiError(err)
      setErrors(fields)
      if (message) toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={business ? t('tracker.editBusiness') : t('tracker.newBusiness')} wide>
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormField label={t('tracker.businessName')} placeholder={t('tracker.businessNamePlaceholder')} {...field('name')} />
        <div>
          <p className="mb-2 text-sm font-bold text-stone-700">{t('tracker.businessType')}</p>
          <EmojiGrid options={BUSINESS_TYPES} value={form.business_type} onChange={(v) => setForm({ ...form, business_type: v })} labelKey="bizTypes" />
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-stone-700">{t('tracker.season')}</p>
          <div className="flex flex-wrap gap-2">
            {SEASONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, season: s })}
                className={`chip ${form.season === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700'}`}
              >
                {t(`seasons.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('tracker.startDate')} type="date" {...field('start_date')} />
          <FormField label={t('tracker.endDate')} type="date" {...field('end_date')} />
          <FormField label={t('tracker.area')} type="number" min="0" step="0.5" {...field('area_acres')} />
        </div>
        <FormField label={t('product.description')} {...field('description')} />
        {business && (
          <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-white px-4 py-3 font-semibold text-stone-700">
            {t('tracker.activeBusiness')}
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="size-6 accent-brand-600" />
          </label>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('auth.pleaseWait') : t('account.save')}
        </button>
      </form>
    </Modal>
  )
}

/** Add or edit an expense (`kind="expense"`) or income (`kind="income"`) entry. */
export function EntryModal({ open, onClose, kind, businessId, entry, onSaved }) {
  const { t } = useTranslation()
  const isExpense = kind === 'expense'
  const choiceKey = isExpense ? 'category' : 'source'
  const [form, setForm] = useState(() => ({
    [choiceKey]: entry?.[choiceKey] ?? '',
    amount: entry ? Number(entry.amount) : '',
    date: entry?.date ?? today(),
    notes: entry?.notes ?? '',
    quantity: entry?.quantity ?? '',
    unit: entry?.unit ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const field = (key) => ({ value: form[key] ?? '', onChange: (e) => setForm({ ...form, [key]: e.target.value }), error: errors[key] })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const path = isExpense ? '/tracker/expenses/' : '/tracker/incomes/'
    const body = { ...form, business: businessId }
    if (isExpense) {
      delete body.quantity
      delete body.unit
    } else if (!body.quantity) body.quantity = null
    try {
      const { data } = entry ? await api.patch(`${path}${entry.id}/`, body) : await api.post(path, body)
      toast.success(isExpense ? t('tracker.expenseSaved') : t('tracker.incomeSaved'))
      onSaved(data)
      onClose()
    } catch (err) {
      const { message, fields } = parseApiError(err)
      setErrors(fields)
      if (message) toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const title = entry ? t('tracker.editEntry') : isExpense ? t('tracker.addExpense') : t('tracker.addIncome')
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-bold text-stone-700">{isExpense ? t('tracker.whatFor') : t('tracker.fromWhat')}</p>
          <EmojiGrid
            options={isExpense ? EXPENSE_CATEGORIES : INCOME_SOURCES}
            value={form[choiceKey]}
            onChange={(v) => setForm({ ...form, [choiceKey]: v })}
            labelKey={isExpense ? 'expenseCats' : 'incomeSources'}
          />
          {errors[choiceKey] && <p className="mt-1.5 text-sm font-semibold text-red-600">{errors[choiceKey]}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('tracker.amount')} type="number" min="1" inputMode="decimal" placeholder="25000" className="latin" {...field('amount')} />
          <FormField label={t('tracker.date')} type="date" {...field('date')} />
          {!isExpense && (
            <>
              <FormField label={`${t('sell.quantity')} (${t('tracker.optional')})`} type="number" min="0" {...field('quantity')} />
              <FormField label={`${t('sell.unit')} (${t('tracker.optional')})`} placeholder="maund, liter…" {...field('unit')} />
            </>
          )}
        </div>
        <FormField label={t('tracker.notes')} placeholder={t('tracker.notesPlaceholder')} {...field('notes')} />
        <button type="submit" disabled={busy} className={`w-full ${isExpense ? 'btn bg-orange-600 text-white hover:bg-orange-700' : 'btn-primary'}`}>
          {busy ? t('auth.pleaseWait') : t('account.save')}
        </button>
      </form>
    </Modal>
  )
}
