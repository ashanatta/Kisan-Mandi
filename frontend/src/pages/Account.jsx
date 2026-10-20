import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiArrowRightOnRectangle, HiChevronRight, HiOutlineMapPin } from 'react-icons/hi2'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import FormField from '../components/FormField'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/errors'

const BACKEND_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '')

const ACTIONS = {
  seller: [
    ['➕', 'addProduct', '/sell', 'bg-amber-100'],
    ['📦', 'myListings', '/my/listings', 'bg-lime-100'],
    ['📥', 'receivedOrders', '/orders/received', 'bg-sky-100'],
    ['📊', 'tracker', '/tracker', 'bg-brand-100'],
  ],
  buyer: [
    ['🌾', 'browse', '/products', 'bg-amber-100'],
    ['🛒', 'cart', '/cart', 'bg-lime-100'],
    ['📦', 'myOrders', '/orders', 'bg-sky-100'],
    ['📊', 'tracker', '/tracker', 'bg-brand-100'],
  ],
}

function ProfileForm({ user }) {
  const { t, i18n } = useTranslation()
  const { updateProfile } = useAuth()
  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
    whatsapp: user.whatsapp,
    city: user.city,
    district: user.district,
    address: user.address,
    preferred_language: user.preferred_language,
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const field = (key) => ({
    value: form[key] ?? '',
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: errors[key],
  })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const updated = await updateProfile(form)
      i18n.changeLanguage(updated.preferred_language)
      toast.success(t('account.saved'))
    } catch (err) {
      const { message, fields } = parseApiError(err)
      setErrors(fields)
      if (message) toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card p-6" noValidate>
      <h2 className="text-xl font-extrabold text-brand-950">👤 {t('account.profile')}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormField label={t('auth.firstName')} {...field('first_name')} />
        <FormField label={t('auth.lastName')} {...field('last_name')} />
        <FormField label={t('auth.email')} type="email" {...field('email')} />
        <FormField label={t('auth.phone')} type="tel" placeholder="03001234567" {...field('phone')} />
        <FormField label="WhatsApp" type="tel" placeholder="03001234567" {...field('whatsapp')} />
        <FormField label={t('auth.city')} {...field('city')} />
        <FormField label={t('account.district')} {...field('district')} />
        <div>
          <label className="mb-1.5 block text-sm font-bold text-stone-700" htmlFor="pref-lang">
            {t('language')}
          </label>
          <select id="pref-lang" className="input cursor-pointer" {...field('preferred_language')}>
            <option value="en">English</option>
            <option value="ur">اردو</option>
          </select>
        </div>
        <FormField label={t('account.address')} className="sm:col-span-2" {...field('address')} />
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-6">
        {busy ? t('auth.pleaseWait') : t('account.save')}
      </button>
    </form>
  )
}

function PasswordForm() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ old_password: '', new_password: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      await api.post('/auth/change-password/', form)
      setForm({ old_password: '', new_password: '' })
      toast.success(t('account.passwordChanged'))
    } catch (err) {
      setErrors(parseApiError(err).fields)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card p-6" noValidate>
      <h2 className="text-xl font-extrabold text-brand-950">🔑 {t('account.changePassword')}</h2>
      <div className="mt-5 space-y-4">
        <FormField
          label={t('account.currentPassword')}
          type="password"
          autoComplete="current-password"
          value={form.old_password}
          onChange={(e) => setForm({ ...form, old_password: e.target.value })}
          error={errors.old_password}
        />
        <FormField
          label={t('account.newPassword')}
          type="password"
          autoComplete="new-password"
          value={form.new_password}
          onChange={(e) => setForm({ ...form, new_password: e.target.value })}
          error={errors.new_password}
        />
      </div>
      <button type="submit" disabled={busy || !form.old_password || !form.new_password} className="btn-outline mt-6">
        {t('account.updatePassword')}
      </button>
    </form>
  )
}

export default function Account() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initials = (user.full_name || user.username)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const memberSince = new Date(user.date_joined).toLocaleDateString(i18n.resolvedLanguage === 'ur' ? 'ur-PK' : 'en-PK', {
    month: 'long',
    year: 'numeric',
  })
  // Admins see the seller shortcuts too, since they can post listings.
  const actions = ACTIONS[user.role === 'buyer' ? 'buyer' : 'seller']

  const handleLogout = () => {
    logout()
    toast(t('account.loggedOut'), { icon: '👋' })
    navigate('/')
  }

  return (
    <div className="container-page space-y-6 py-8">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-6 text-white sm:p-8">
        <div aria-hidden className="absolute -end-6 -top-6 select-none text-[9rem] opacity-15">
          {user.role === 'seller' ? '👨‍🌾' : '🛒'}
        </div>
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="latin grid size-20 place-items-center rounded-3xl bg-white/15 text-3xl font-extrabold ring-4 ring-white/20 backdrop-blur">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-brand-100">{t('account.greeting')}</p>
            <h1 className="truncate text-3xl font-extrabold">{user.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-amber-400 px-3 py-0.5 font-bold text-brand-950">
                {t(`account.role_${user.role}`)}
              </span>
              <span className="latin text-brand-100">@{user.username}</span>
              {user.city && (
                <span className="flex items-center gap-1 text-brand-100">
                  <HiOutlineMapPin className="size-4" /> {user.city}
                </span>
              )}
              <span className="text-brand-100">· {t('product.memberSince', { date: memberSince })}</span>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="btn border-2 border-white/30 text-white hover:bg-white/10">
            <HiArrowRightOnRectangle className="size-5 rtl:rotate-180" />
            {t('account.logout')}
          </button>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {actions.map(([emoji, key, to, bg]) => (
          <Link key={key} to={to} className="card group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${bg}`}>{emoji}</span>
            <span className="flex-1 font-bold text-stone-800">{t(`account.${key}`)}</span>
            <HiChevronRight className="size-5 text-stone-300 transition group-hover:text-brand-600 rtl:rotate-180" />
          </Link>
        ))}
      </section>

      {user.is_platform_admin && (
        <section className="card flex flex-wrap items-center gap-4 border-violet-200 bg-violet-50 p-5">
          <span className="text-3xl">🛡️</span>
          <div className="flex-1">
            <p className="font-extrabold text-violet-950">{t('account.adminTitle')}</p>
            <p className="text-sm text-violet-800">{t('account.adminText')}</p>
          </div>
          <a href={`${BACKEND_URL}/admin/`} target="_blank" rel="noreferrer" className="btn bg-violet-600 text-white hover:bg-violet-700">
            Django Admin
          </a>
          <a href={`${BACKEND_URL}/api/docs/`} target="_blank" rel="noreferrer" className="btn-outline">
            API Docs
          </a>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <ProfileForm user={user} />
        <PasswordForm />
      </div>
    </div>
  )
}
