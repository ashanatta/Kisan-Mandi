import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiOutlineCamera, HiOutlineLockClosed } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import api from '../api/client'
import FormField from '../components/FormField'
import PageHeader from '../components/PageHeader'
import VerifiedBadge from '../components/trust/VerifiedBadge'
import { useAuth } from '../context/AuthContext'
import useApi from '../hooks/useApi'
import { parseApiError } from '../utils/errors'

/** 12345-1234567-1 formatting while typing */
function formatCnic(value) {
  const d = value.replace(/\D/g, '').slice(0, 13)
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join('-')
}

function PhotoPicker({ label, file, onChange, error }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-stone-700">{label}</p>
      <label className={`flex aspect-[16/10] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${error ? 'border-red-300 bg-red-50' : 'border-brand-300 bg-brand-50 hover:bg-brand-100'}`}>
        {preview ? (
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-brand-700">
            <HiOutlineCamera className="size-8" />
            <span className="text-sm font-bold">{t('trust.takePhoto')}</span>
          </span>
        )}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onChange(e.target.files[0] ?? null)} />
      </label>
      {error && <p className="mt-1.5 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  )
}

export default function Verification() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const status = useApi('/auth/verification/')
  const [form, setForm] = useState({ cnic_number: '', name_on_cnic: user.full_name })
  const [front, setFront] = useState(null)
  const [back, setBack] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const v = status.data
  const canSubmit = v && (v.status === 'none' || v.status === 'rejected')

  const submit = async (e) => {
    e.preventDefault()
    const body = new FormData()
    body.append('cnic_number', form.cnic_number)
    body.append('name_on_cnic', form.name_on_cnic)
    if (front) body.append('cnic_front', front)
    if (back) body.append('cnic_back', back)
    setBusy(true)
    setErrors({})
    try {
      await api.post('/auth/verification/', body)
      toast.success(t('trust.verificationSent'), { duration: 5000 })
      status.reload()
    } catch (err) {
      const { message, fields } = parseApiError(err)
      setErrors(fields)
      if (message) toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader emoji="🛡️" title={t('trust.getVerified')} subtitle={t('trust.getVerifiedSubtitle')} />

      {status.loading && <div className="h-40 animate-pulse rounded-3xl bg-stone-200/60" />}

      {v?.status === 'approved' && (
        <div className="card flex flex-col items-center p-8 text-center">
          <span className="text-6xl">🎉</span>
          <h2 className="mt-4 text-2xl font-extrabold text-brand-950">{t('trust.youAreVerified')}</h2>
          <VerifiedBadge className="mt-3" />
          <p className="mt-3 text-stone-600">{t('trust.youAreVerifiedText')}</p>
          <Link to={`/sellers/${user.id}`} className="btn-primary mt-6">{t('trust.viewMyProfile')}</Link>
        </div>
      )}

      {v?.status === 'pending' && (
        <div className="card flex flex-col items-center p-8 text-center">
          <span className="text-6xl">⏳</span>
          <h2 className="mt-4 text-2xl font-extrabold text-brand-950">{t('trust.underReview')}</h2>
          <p className="mt-2 text-stone-600">{t('trust.underReviewText')}</p>
          <p className="latin mt-3 rounded-full bg-stone-100 px-4 py-1 text-sm font-semibold text-stone-600">CNIC {v.masked_cnic}</p>
        </div>
      )}

      {canSubmit && (
        <form onSubmit={submit} noValidate className="space-y-5">
          {v.status === 'rejected' && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
              ⛔ <b>{t('trust.rejected')}</b> {v.rejection_reason}
            </div>
          )}

          <section className="card grid gap-4 p-6 sm:grid-cols-3">
            {[['🛡️', 'why1'], ['⭐', 'why2'], ['📈', 'why3']].map(([emoji, key]) => (
              <div key={key} className="flex items-start gap-3 sm:flex-col">
                <span className="text-3xl">{emoji}</span>
                <p className="text-sm font-semibold text-stone-700">{t(`trust.${key}`)}</p>
              </div>
            ))}
          </section>

          <section className="card space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('trust.cnicNumber')}
                inputMode="numeric"
                placeholder="35202-1234567-1"
                className="latin"
                value={form.cnic_number}
                onChange={(e) => setForm({ ...form, cnic_number: formatCnic(e.target.value) })}
                error={errors.cnic_number}
              />
              <FormField label={t('trust.nameOnCnic')} value={form.name_on_cnic} onChange={(e) => setForm({ ...form, name_on_cnic: e.target.value })} error={errors.name_on_cnic} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <PhotoPicker label={t('trust.cnicFront')} file={front} onChange={setFront} error={errors.cnic_front} />
              <PhotoPicker label={t('trust.cnicBack')} file={back} onChange={setBack} error={errors.cnic_back} />
            </div>
          </section>

          <p className="flex items-start gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <HiOutlineLockClosed className="mt-0.5 size-5 shrink-0" /> {t('trust.privacyNote')}
          </p>

          <button type="submit" disabled={busy || !front || !back || form.cnic_number.length !== 15} className="btn-primary w-full">
            {busy ? t('auth.pleaseWait') : t('trust.submitVerification')}
          </button>
        </form>
      )}
    </div>
  )
}
