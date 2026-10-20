/**
 * Turn an axios error from DRF into `{ message, fields }`.
 * `fields` maps field name → first error message.
 */
export function parseApiError(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data
  if (!error?.response) {
    return { message: 'Cannot reach the server. Is the backend running?', fields: {} }
  }
  if (!data || typeof data !== 'object') return { message: fallback, fields: {} }

  const fields = {}
  let message = data.detail || ''
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'detail') return
    const text = Array.isArray(value) ? value[0] : String(value)
    if (key === 'non_field_errors') message = text
    else fields[key] = text
  })
  return { message: message || (Object.keys(fields).length ? '' : fallback), fields }
}
