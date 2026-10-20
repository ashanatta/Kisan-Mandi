import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import FormField from '../components/FormField'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/errors'

// Seeded demo accounts (see `python manage.py seed_data`)
const DEMO_ACCOUNTS = [
  { emoji: '👨‍🌾', key: 'demoSeller', username: 'aslam', password: 'Demo@12345' },
  { emoji: '🛒', key: 'demoBuyer', username: 'ali', password: 'Demo@12345' },
  { emoji: '🛡️', key: 'demoAdmin', username: 'admin', password: 'Admin@12345' },
]

export default function Login() {
  const { t } = useTranslation()
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState({ message: '', fields: {} })
  const [busy, setBusy] = useState(false)

  const redirectTo = location.state?.from?.pathname ?? '/account'
  if (user && !busy) return <Navigate to={redirectTo} replace />

  const submit = async (credentials) => {
    setBusy(true)
    setError({ message: '', fields: {} })
    try {
      const account = await login(credentials.username.trim(), credentials.password)
      toast.success(t('auth.welcome', { name: account.first_name || account.username }))
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(form)
        }}
        className="space-y-5"
        noValidate
      >
        {error.message && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">
            {error.message}
          </div>
        )}
        <FormField
          label={t('auth.usernameOrEmail')}
          autoComplete="username"
          required
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          error={error.fields.username}
          placeholder="aslam / aslam@example.com"
        />
        <FormField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={error.fields.password}
        />
        <button type="submit" disabled={busy || !form.username || !form.password} className="btn-primary w-full">
          {busy ? t('auth.pleaseWait') : t('auth.loginButton')}
        </button>
      </form>

      <p className="mt-6 text-center text-stone-600">
        {t('auth.noAccount')}{' '}
        <Link to="/register" state={location.state} className="font-bold text-brand-700 hover:underline">
          {t('auth.registerLink')}
        </Link>
      </p>

      {/* Demo shortcuts – development builds only, never shown in production */}
      {import.meta.env.DEV && (
      <div className="mt-8 rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
        <p className="font-bold text-amber-900">🧪 {t('auth.demoTitle')}</p>
        <p className="mt-1 text-sm text-amber-800">{t('auth.demoText')}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.username}
              type="button"
              disabled={busy}
              onClick={() => {
                setForm({ username: acc.username, password: acc.password })
                submit(acc)
              }}
              className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-3 text-start text-sm font-bold text-stone-800 shadow-sm ring-1 ring-amber-200 transition hover:ring-amber-400 disabled:opacity-60"
            >
              <span className="text-2xl">{acc.emoji}</span>
              <span>
                {t(`auth.${acc.key}`)}
                <span className="latin block text-xs font-medium text-stone-500">{acc.username}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      )}
    </AuthShell>
  )
}
