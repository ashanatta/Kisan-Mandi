import { useTranslation } from 'react-i18next'
import { HiOutlineMapPin } from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import { categoryName, formatPrice, kindStyle } from '../utils/format'

export function PriceUnit({ product, className = '' }) {
  const { t } = useTranslation()
  const per = product.listing_type === 'rent' ? t(`rent.${product.rent_period}`) : t(`units.${product.unit}`)
  return (
    <span className={className}>
      <span className="latin">{formatPrice(product.price)}</span>
      <span className="ms-1 text-sm font-medium text-stone-500">/ {per}</span>
    </span>
  )
}

export default function ProductCard({ product, compact = false }) {
  const { t, i18n } = useTranslation()
  const style = kindStyle(product.category?.kind)
  const isLivestock = product.category?.kind === 'livestock'

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200/70 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/10"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {product.primary_image ? (
          <img
            src={product.primary_image}
            alt={product.title}
            loading="lazy"
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`grid size-full place-items-center text-6xl ${style.tile}`}>{style.emoji}</div>
        )}
        <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
          {product.listing_type === 'rent' && (
            <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-brand-950 shadow">
              {t('product.forRent')}
            </span>
          )}
          {product.condition !== 'na' && (
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-stone-700 shadow backdrop-blur">
              {t(`conditions.${product.condition}`)}
            </span>
          )}
        </div>
      </div>

      <div className={`flex flex-1 flex-col gap-2 ${compact ? 'p-3' : 'p-4'}`}>
        {product.category && (
          <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
            {product.category.icon} {categoryName(product.category, i18n.resolvedLanguage)}
          </span>
        )}
        <h3 className={`line-clamp-2 font-bold text-stone-900 group-hover:text-brand-700 ${compact ? 'text-sm' : 'text-base'}`}>
          {product.title}
        </h3>

        {isLivestock && (product.breed || product.milk_liters_per_day) && (
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            {product.breed && <span className="rounded-lg bg-stone-100 px-2 py-1 text-stone-700">{product.breed}</span>}
            {product.milk_liters_per_day && (
              <span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">
                🥛 {t('product.milkPerDay', { value: Number(product.milk_liters_per_day) })}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto pt-1">
          <PriceUnit product={product} className={`block font-extrabold text-brand-700 ${compact ? 'text-base' : 'text-xl'}`} />
          <p className="mt-1 flex items-center gap-1 text-sm text-stone-500">
            <HiOutlineMapPin className="size-4 shrink-0" />
            <span className="truncate">{product.city}</span>
          </p>
        </div>
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200/70 bg-white">
      <div className="aspect-[4/3] animate-pulse bg-stone-200/70" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-stone-200/70" />
        <div className="h-5 w-4/5 animate-pulse rounded-full bg-stone-200/70" />
        <div className="h-6 w-1/2 animate-pulse rounded-full bg-stone-200/70" />
      </div>
    </div>
  )
}
