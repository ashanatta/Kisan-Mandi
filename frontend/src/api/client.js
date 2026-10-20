import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'
const TOKENS_KEY = 'agri_tokens'

export const tokenStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(TOKENS_KEY))
    } catch {
      return null
    }
  },
  set(tokens) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
    } catch {
      /* storage unavailable (private mode) – session only */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKENS_KEY)
    } catch {
      /* ignore */
    }
  },
}

const api = axios.create({ baseURL, timeout: 15000 })

api.interceptors.request.use((config) => {
  const access = tokenStore.get()?.access
  if (access) config.headers.Authorization = `Bearer ${access}`
  return config
})

// One shared refresh request, even if several calls fail with 401 at once.
let refreshing = null

function refreshTokens() {
  const refresh = tokenStore.get()?.refresh
  if (!refresh) return Promise.reject(new Error('No refresh token'))
  refreshing ??= axios
    .post(`${baseURL}/auth/refresh/`, { refresh })
    .then(({ data }) => {
      tokenStore.set({ access: data.access, refresh: data.refresh ?? refresh })
      return data.access
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh')
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall && tokenStore.get()) {
      original._retry = true
      try {
        const access = await refreshTokens()
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
      } catch {
        tokenStore.clear()
        window.dispatchEvent(new Event('auth:logout'))
      }
    }
    return Promise.reject(error)
  },
)

export default api
