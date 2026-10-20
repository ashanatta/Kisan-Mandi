import { useEffect } from 'react'
import { HiXMark } from 'react-icons/hi2'

/** Bottom sheet on phones, centred dialog on larger screens. Closes on Esc or backdrop click. */
export default function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative max-h-[92svh] w-full animate-fade-up overflow-y-auto rounded-t-[2rem] bg-cream p-6 pb-10 shadow-2xl sm:rounded-[2rem] sm:pb-6 ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-stone-300 sm:hidden" />
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold text-brand-950">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-stone-600 hover:bg-stone-100"
          >
            <HiXMark className="size-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
