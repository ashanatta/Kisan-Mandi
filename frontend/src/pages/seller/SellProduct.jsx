import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiOutlineCamera, HiOutlineStar, HiOutlineTrash, HiStar, HiXMark } from 'react-icons/hi2'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import EmptyState from '../../components/EmptyState'
import FormField from '../../components/FormField'
import PageHeader from '../../components/PageHeader'
import ProductCard from '../../components/ProductCard'
import { useAuth } from '../../context/AuthContext'
import useApi from '../../hooks/useApi'
import { parseApiError } from '../../utils/errors'
import { categoryName } from '../../utils/format'

const UNITS = ['kg', 'maund', 'bag', 'liter', 'piece']
const RENT_PERIODS = ['acre', 'hour', 'day', 'month']
const MAX_PHOTOS = 8

const EMPTY = {
  category: '', title: '', description: '', price: '', quantity: '', unit: 'kg', condition: 'na',
  city: '', district: '', listing_type: 'sale', rent_period: '', brand: '', model_year: '',
  breed: '', gender: '', age_months: '', weight_kg: '', milk_liters_per_day: '', linked_business: '', is_active: true,
}

function Section({ title, children }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-extrabold text-brand-950">{title}</h2>
      {children}
    </section>
  )
}

function ChipGroup({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`chip ${value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function BecomeSeller() {
  const { t } = useTranslation()
  const { becomeSeller } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <div className="container-page py-10">
      <EmptyState
        emoji="👨‍🌾"
        title={t('sell.becomeSellerTitle')}
        text={t('sell.becomeSellerText')}
        action={
          <button
            type="button"
            disabled={busy}
            className="btn-accent"
            onClick={async () => {
              setBusy(true)
              try {
                await becomeSeller()
                toast.success(t('sell.becameSeller'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('sell.becomeSellerButton')}
          </button>
        }
      />
    </div>
  )
}

/** Only CNIC-verified sellers in good standing can list (Kisan Mandi Protection rule). */
function VerificationRequired() {
  const { t } = useTranslation()
  return (
    <div className="container-page py-10">
      <EmptyState
        emoji="🪪"
        title={t('sell.verifyFirstTitle')}
        text={t('sell.verifyFirstText')}
        action={<Link to="/account/verification" className="btn-accent">{t('trust.getVerified')}</Link>}
      />
    </div>
  )
}

export default function SellProduct() {
  const { user } = useAuth()
  const { id } = useParams()
  if (user.role === 'buyer') return <BecomeSeller />
  // Editing existing listings stays possible; creating new ones needs verification.
  if (!id && !user.can_sell && !user.is_platform_admin) return <VerificationRequired />
  return <ProductForm />
}

function ProductForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage
  const { user } = useAuth()
  const navigate = useNavigate()

  const categories = useApi('/categories/')
  const businesses = useApi('/tracker/businesses/')
  const existing = useApi(isEdit ? `/my/products/${id}/` : null)

  const [form, setForm] = useState({ ...EMPTY, city: user.city, district: user.district || user.city })
  const [parentId, setParentId] = useState(null)
  const [photos, setPhotos] = useState([]) // new files: { file, url }
  const [images, setImages] = useState([]) // saved images (edit mode)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // Fill the form when editing
  useEffect(() => {
    const p = existing.data
    if (!p) return
    const next = { ...EMPTY }
    Object.keys(EMPTY).forEach((k) => {
      if (p[k] !== null && p[k] !== undefined) next[k] = p[k]
    })
    next.category = p.category.id
    next.price = Number(p.price)
    next.quantity = Number(p.quantity)
    next.linked_business = p.linked_business ?? ''
    setForm(next)
    setImages(p.images)
  }, [existing.data])

  // Work out the parent category for the selected sub-category
  const parent = useMemo(() => {
    const all = categories.data ?? []
    return all.find((c) => c.id === parentId) ?? all.find((c) => c.id === form.category || c.children.some((ch) => ch.id === form.category))
  }, [categories.data, parentId, form.category])
  const kind = parent?.kind
  const isRent = kind === 'equipment' && form.listing_type === 'rent'

  // Free preview URLs when leaving the page
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const removePhoto = (photo) => {
    URL.revokeObjectURL(photo.url)
    setPhotos((prev) => prev.filter((x) => x !== photo))
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const field = (key) => ({ value: form[key] ?? '', onChange: (e) => set(key, e.target.value), error: errors[key] })

  const addPhotos = (fileList) => {
    const room = MAX_PHOTOS - images.length - photos.length
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(room, 0))
    if (files.length < fileList.length) toast(t('sell.maxPhotos', { count: MAX_PHOTOS }))
    setPhotos((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  const imageAction = async (method, path) => {
    try {
      const { data } = await api[method](`/my/products/${id}/images/${path}`)
      setImages(data.images)
    } catch (err) {
      toast.error(parseApiError(err).message)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const body = new FormData()
    Object.entries(form).forEach(([k, v]) => body.append(k, v ?? ''))
    photos.forEach((p) => body.append('uploaded_images', p.file))
    try {
      if (isEdit) await api.patch(`/my/products/${id}/`, body)
      else await api.post('/my/products/', body)
      toast.success(isEdit ? t('sell.updated') : t('sell.submitted'), { duration: 5000 })
      navigate('/my/listings')
    } catch (err) {
      const { message, fields } = parseApiError(err)
      setErrors(fields)
      toast.error(message || t('sell.fixErrors'))
    } finally {
      setBusy(false)
    }
  }

  if (isEdit && existing.error) {
    return (
      <div className="container-page py-10">
        <EmptyState emoji="🍂" title={t('product.notFound')} action={<Link to="/my/listings" className="btn-primary">{t('account.myListings')}</Link>} />
      </div>
    )
  }

  const selectedChild = parent?.children.find((c) => c.id === Number(form.category))
  const preview = {
    id: 0,
    title: form.title || t('sell.previewTitle'),
    price: form.price || 0,
    unit: form.unit,
    listing_type: kind === 'equipment' ? form.listing_type : 'sale',
    rent_period: form.rent_period || 'acre',
    condition: form.condition,
    city: form.city || '—',
    category: selectedChild ? { ...selectedChild, kind } : parent ? { ...parent } : null,
    primary_image: photos[0]?.url ?? images.find((i) => i.is_primary)?.image ?? images[0]?.image ?? null,
    breed: kind === 'livestock' ? form.breed : '',
    milk_liters_per_day: kind === 'livestock' ? form.milk_liters_per_day : null,
  }

  return (
    <div className="container-page py-8">
      <PageHeader emoji={isEdit ? '✏️' : '📸'} title={isEdit ? t('sell.editTitle') : t('sell.title')} subtitle={t('sell.subtitle')} />

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Photos */}
          <Section title={`📷 ${t('sell.photos')}`}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((img) => (
                <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl bg-stone-100">
                  <img src={img.image} alt="" className="size-full object-cover" />
                  <div className="absolute inset-x-1.5 top-1.5 flex justify-between">
                    <button type="button" title={t('sell.makeCover')} onClick={() => imageAction('post', `${img.id}/primary/`)} className="grid size-8 place-items-center rounded-full bg-white/90 text-amber-500 shadow">
                      {img.is_primary ? <HiStar className="size-5" /> : <HiOutlineStar className="size-5" />}
                    </button>
                    <button type="button" title={t('sell.removePhoto')} onClick={() => imageAction('delete', `${img.id}/`)} className="grid size-8 place-items-center rounded-full bg-white/90 text-red-600 shadow">
                      <HiOutlineTrash className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
              {photos.map((p, i) => (
                <div key={p.url} className="relative aspect-square overflow-hidden rounded-2xl bg-stone-100 ring-2 ring-brand-300">
                  <img src={p.url} alt="" className="size-full object-cover" />
                  {i === 0 && images.length === 0 && (
                    <span className="absolute bottom-1.5 start-1.5 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-brand-950">{t('sell.cover')}</span>
                  )}
                  <button type="button" onClick={() => removePhoto(p)} className="absolute end-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow">
                    <HiXMark className="size-5" />
                  </button>
                </div>
              ))}
              {images.length + photos.length < MAX_PHOTOS && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 text-brand-700 transition hover:bg-brand-100">
                  <HiOutlineCamera className="size-8" />
                  <span className="text-sm font-bold">{t('sell.addPhotos')}</span>
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
                </label>
              )}
            </div>
            <p className={`mt-3 text-sm ${errors.uploaded_images ? 'font-semibold text-red-600' : 'text-stone-500'}`}>
              {errors.uploaded_images || t('sell.photosHint', { count: MAX_PHOTOS })}
            </p>
          </Section>

          {/* Category */}
          <Section title={`🗂️ ${t('sell.category')}`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.data?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setParentId(c.id); set('category', '') }}
                  className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 text-start font-bold transition ${
                    parent?.id === c.id ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'
                  }`}
                >
                  <span className="text-2xl">{c.icon}</span>
                  <span className="text-sm leading-tight">{categoryName(c, lang)}</span>
                </button>
              ))}
            </div>
            {parent && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-bold text-stone-700">{t('sell.subCategory')}</p>
                <ChipGroup
                  value={Number(form.category)}
                  onChange={(v) => set('category', v)}
                  options={parent.children.map((ch) => [ch.id, `${ch.icon} ${categoryName(ch, lang)}`])}
                />
              </div>
            )}
            {errors.category && <p className="mt-2 text-sm font-semibold text-red-600">{errors.category}</p>}
          </Section>

          {/* Details */}
          <Section title={`📝 ${t('sell.details')}`}>
            <div className="space-y-4">
              <FormField label={t('sell.titleLabel')} placeholder={t('sell.titlePlaceholder')} maxLength={200} {...field('title')} />
              <div>
                <label className="mb-1.5 block text-sm font-bold text-stone-700" htmlFor="desc">{t('product.description')}</label>
                <textarea id="desc" rows={4} className="input py-3" placeholder={t('sell.descPlaceholder')} {...field('description')} />
              </div>

              {kind === 'equipment' && (
                <div>
                  <p className="mb-2 text-sm font-bold text-stone-700">{t('products.listingType')}</p>
                  <ChipGroup value={form.listing_type} onChange={(v) => set('listing_type', v)} options={[['sale', `🏷️ ${t('listingTypes.sale')}`], ['rent', `🔑 ${t('listingTypes.rent')}`]]} />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={isRent ? t('sell.rentPrice') : t('sell.price')} type="number" min="1" inputMode="decimal" className="latin" {...field('price')} />
                {isRent ? (
                  <div>
                    <p className="mb-1.5 text-sm font-bold text-stone-700">{t('sell.rentPer')}</p>
                    <ChipGroup value={form.rent_period} onChange={(v) => set('rent_period', v)} options={RENT_PERIODS.map((p) => [p, t(`rent.${p}`)])} />
                    {errors.rent_period && <p className="mt-1.5 text-sm font-semibold text-red-600">{errors.rent_period}</p>}
                  </div>
                ) : (
                  <FormField label={t('sell.quantity')} type="number" min="0" inputMode="decimal" {...field('quantity')} />
                )}
              </div>
              {isRent && <FormField label={t('sell.machines')} type="number" min="1" inputMode="numeric" {...field('quantity')} />}

              <div>
                <p className="mb-2 text-sm font-bold text-stone-700">{t('sell.unit')}</p>
                <ChipGroup value={form.unit} onChange={(v) => set('unit', v)} options={UNITS.map((u) => [u, t(`units.${u}`)])} />
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-stone-700">{t('product.condition')}</p>
                <ChipGroup value={form.condition} onChange={(v) => set('condition', v)} options={[['new', t('conditions.new')], ['used', t('conditions.used')], ['na', t('sell.notApplicable')]]} />
              </div>
            </div>
          </Section>

          {kind === 'livestock' && (
            <Section title={`🐄 ${t('sell.animalDetails')}`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('product.breed')} placeholder="Sahiwal, Nili-Ravi, Beetal…" {...field('breed')} />
                <div>
                  <p className="mb-1.5 text-sm font-bold text-stone-700">{t('product.gender')}</p>
                  <ChipGroup value={form.gender} onChange={(v) => set('gender', v)} options={[['female', t('genders.female')], ['male', t('genders.male')]]} />
                </div>
                <FormField label={`${t('product.age')} (${t('sell.months')})`} type="number" min="0" {...field('age_months')} />
                <FormField label={`${t('product.weight')} (kg)`} type="number" min="0" {...field('weight_kg')} />
                <FormField label={`${t('product.milk')} (${t('sell.litersPerDay')})`} type="number" min="0" step="0.5" {...field('milk_liters_per_day')} />
              </div>
            </Section>
          )}

          {kind === 'equipment' && (
            <Section title={`🚜 ${t('sell.machineDetails')}`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('product.brand')} placeholder="Massey Ferguson, Kubota…" {...field('brand')} />
                <FormField label={t('product.modelYear')} type="number" min="1950" max="2100" {...field('model_year')} />
              </div>
            </Section>
          )}

          <Section title={`📍 ${t('product.location')}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('auth.city')} {...field('city')} />
              <FormField label={t('account.district')} {...field('district')} />
            </div>
          </Section>

          <Section title={`📊 ${t('sell.linkBusiness')}`}>
            <p className="mb-3 text-sm text-stone-600">{t('sell.linkBusinessHint')}</p>
            <select className="input cursor-pointer" {...field('linked_business')}>
              <option value="">{t('sell.noBusiness')}</option>
              {businesses.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.linked_business && <p className="mt-1.5 text-sm font-semibold text-red-600">{errors.linked_business}</p>}
          </Section>
        </div>

        {/* Live preview + submit */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-bold text-stone-500">👀 {t('sell.preview')}</p>
          <div className="pointer-events-none">
            <ProductCard product={preview} />
          </div>
          <div className="card mt-4 space-y-3 p-4">
            {isEdit && (
              <label className="flex cursor-pointer items-center justify-between gap-3 font-semibold text-stone-700">
                {t('sell.visible')}
                <input type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => set('is_active', e.target.checked)} className="size-6 accent-brand-600" />
              </label>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t('auth.pleaseWait') : isEdit ? t('account.save') : t('sell.submit')}
            </button>
            {!isEdit && <p className="text-center text-xs text-stone-500">⏳ {t('sell.approvalNote')}</p>}
          </div>
        </aside>
      </form>
    </div>
  )
}
