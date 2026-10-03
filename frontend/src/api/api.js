import axios from 'axios'

// Single API client for the whole app.
// withCredentials sends the JWT cookie, exactly like the backend's
// cookie-based auth expects (see backend authMiddleware).
// Override the backend URL locally with frontend/.env:
//   VITE_API_URL=http://localhost:5001
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001',
  withCredentials: true,
})
