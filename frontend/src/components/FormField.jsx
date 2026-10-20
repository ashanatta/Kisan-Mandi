import { useId, useState } from 'react'
import { HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2'

/** Labelled input with an error message underneath. Password fields get a show/hide toggle. */
export default function FormField({ label, error, hint, type = 'text', className = '', ...props }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-stone-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`input ${isPassword ? 'pe-12' : ''} ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute end-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            {visible ? <HiOutlineEyeSlash className="size-5" /> : <HiOutlineEye className="size-5" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-stone-500">{hint}</p>
      )}
    </div>
  )
}
