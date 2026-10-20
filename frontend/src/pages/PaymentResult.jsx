import { Navigate, useSearchParams } from 'react-router-dom'

/** JazzCash sends the buyer back to /payment/result?ref=… – show that payment's page. */
export default function PaymentResult() {
  const [params] = useSearchParams()
  const ref = params.get('ref')
  return <Navigate to={ref ? `/pay/${ref}` : '/orders'} replace />
}
