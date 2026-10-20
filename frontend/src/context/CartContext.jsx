import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'

const EMPTY = { items: [], count: 0, subtotal: 0, sellers: 0 }
const CartContext = createContext(null)

export function CartProvider({ children }) {
  const { user } = useAuth()
  const [cart, setCart] = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setCart((await api.get('/cart/')).data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) refresh().catch(() => setCart(EMPTY))
    else setCart(EMPTY)
  }, [user, refresh])

  // Each call returns the whole updated cart from the API.
  const add = useCallback(async (productId, quantity) => {
    const { data } = await api.post('/cart/', { product_id: productId, quantity })
    setCart(data)
    return data
  }, [])

  const update = useCallback(async (itemId, quantity) => {
    const { data } = await api.patch(`/cart/${itemId}/`, { quantity })
    setCart(data)
  }, [])

  const remove = useCallback(async (itemId) => {
    const { data } = await api.delete(`/cart/${itemId}/`)
    setCart(data)
  }, [])

  const value = useMemo(
    () => ({ cart, loading, refresh, add, update, remove, reset: () => setCart(EMPTY) }),
    [cart, loading, refresh, add, update, remove],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
