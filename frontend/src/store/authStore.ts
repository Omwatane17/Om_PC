import { create } from 'zustand'

interface AuthState {
  accessToken: string | null
  userId: string | null
  orgId: string | null
  email: string | null
  isAuthenticated: boolean
  login: (token: string, userId: string, orgId: string, email: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('access_token'),
  userId: localStorage.getItem('user_id'),
  orgId: localStorage.getItem('org_id'),
  email: localStorage.getItem('email'),
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: (token, userId, orgId, email) => {
    localStorage.setItem('access_token', token)
    localStorage.setItem('user_id', userId)
    localStorage.setItem('org_id', orgId)
    localStorage.setItem('email', email)
    set({ accessToken: token, userId, orgId, email, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('org_id')
    localStorage.removeItem('email')
    set({ accessToken: null, userId: null, orgId: null, email: null, isAuthenticated: false })
  },
}))
