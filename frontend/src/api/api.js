import axios from 'axios'

// Single API client for the whole app.
// withCredentials sends the JWT cookie, exactly like the backend's
// cookie-based auth expects (see backend authMiddleware).
// CSRF: mutating requests echo the double-submit XSRF-TOKEN cookie in the
// x-csrf-token header (see backend middleware/csrf.js). SameSite alone is
// not sufficient protection.
// Override the backend URL locally with frontend/.env:
//   VITE_API_URL=http://localhost:5001
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001',
  withCredentials: true,
})

const readCookie = (name) => {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

let csrfInflight = null
export const ensureCsrfToken = async () => {
  const existing = readCookie('XSRF-TOKEN')
  if (existing) return existing
  if (!csrfInflight) {
    csrfInflight = api
      .get('/api/auth/csrf-token')
      .then((r) => r.data?.csrfToken || readCookie('XSRF-TOKEN'))
      .finally(() => {
        csrfInflight = null
      })
  }
  return csrfInflight
}

api.interceptors.request.use(async (config) => {
  const method = String(config.method || 'get').toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const url = String(config.url || '')
    if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
      try {
        const token = await ensureCsrfToken()
        if (token) config.headers['x-csrf-token'] = token
      } catch {
        // CSRF mint failure: let the request go; the backend rejects with 403.
      }
    }
  }
  return config
})
