import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import FormField from '../components/FormField'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/errors'

const ROLES = [
  { value: 'buyer', emoji: '🛒' },
  { value: 'seller', emoji: '👨‍🌾' },
]

const EMPTY = {
  role: 'buyer',
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  phone: '',
  city: '',
  district: '',
  password: '',
  password2: '',
}

export default function Register() {
  const { t } = useTranslation()
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState({ message: '', fields: {} })
  const [busy, setBusy] = useState(false)

  if (user && !busy) return <Navigate to="/account" replace />

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const field = (key) => ({ value: form[key], onChange: set(key), error: error.fields[key] })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.password2) {
      setError({ message: '', fields: { password2: t('auth.passwordMismatch') } })
      return
    }
    setBusy(true)
    setError({ message: '', fields: {} })
    try {
      const account = await register({ ...form, district: form.district || form.city })
      toast.success(t('auth.welcome', { name: account.first_name }))
      navigate(location.state?.from?.pathname ?? '/account', { replace: true })
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error.message && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">
            {error.message}
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-stone-700">{t('auth.iWantTo')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(({ value, emoji }) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col items-center rounded-3xl border-2 p-4 text-center transition ${
                  form.role === value
                    ? 'border-brand-500 bg-brand-50 shadow-md shadow-brand-500/10'
                    : 'border-stone-200 hover:border-brand-200'
                }`}
              >
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} className="sr-only" />
                <span className="text-4xl">{emoji}</span>
                <span className="mt-2 font-extrabold text-brand-950">{t(`auth.role_${value}`)}</span>
                <span className="text-xs text-stone-500">{t(`auth.role_${value}_hint`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('auth.firstName')} autoComplete="given-name" required {...field('first_name')} />
          <FormField label={t('auth.lastName')} autoComplete="family-name" {...field('last_name')} />
          <FormField label={t('auth.username')} autoComplete="username" required {...field('username')} />
          <FormField label={t('auth.email')} type="email" autoComplete="email" required {...field('email')} />
          <FormField
            label={t('auth.phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="03001234567"
            required
            hint={t('auth.phoneHint')}
            {...field('phone')}
          />
          <FormField label={t('auth.city')} autoComplete="address-level2" required placeholder="Okara" {...field('city')} />
          <FormField label={t('auth.password')} type="password" autoComplete="new-password" required {...field('password')} />
          <FormField label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required {...field('password2')} />
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('auth.pleaseWait') : t('auth.registerButton')}
        </button>
      </form>

      <p className="mt-6 text-center text-stone-600">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-bold text-brand-700 hover:underline">
          {t('auth.loginLink')}
        </Link>
      </p>
    </AuthShell>
  )
}
