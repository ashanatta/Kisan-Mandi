import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { tokenStore } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // `ready` is false until we know whether a saved session is still valid.
  const [ready, setReady] = useState(() => !tokenStore.get())

  useEffect(() => {
    if (!tokenStore.get()) return
    api
      .get('/auth/me/')
      .then(({ data }) => setUser(data))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  const startSession = useCallback(({ access, refresh, user: account }) => {
    tokenStore.set({ access, refresh })
    setUser(account)
    return account
  }, [])

  const login = useCallback(
    async (username, password) => startSession((await api.post('/auth/login/', { username, password })).data),
    [startSession],
  )

  const register = useCallback(
    async (payload) => startSession((await api.post('/auth/register/', payload)).data),
    [startSession],
  )

  const updateProfile = useCallback(async (changes) => {
    const { data } = await api.patch('/auth/me/', changes)
    setUser(data)
    return data
  }, [])

  const becomeSeller = useCallback(async () => {
    const { data } = await api.post('/auth/become-seller/')
    setUser(data)
    return data
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, ready, login, register, logout, updateProfile, becomeSeller }),
    [user, ready, login, register, logout, updateProfile, becomeSeller],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
