import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Usuario } from '../types'
import { api } from '../services/api'

interface AuthState {
  user: Usuario | null
  token: string | null
  isAuthenticated: boolean
  login: (usuario: string, password: string) => Promise<boolean>
  logout: () => void
  setUser: (user: Usuario) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (usuario: string, password: string) => {
        try {
          const { user, token } = await api.login(usuario, password) as { user: Usuario; token: string }
          set({ user, token, isAuthenticated: true })
          return true
        } catch {
          return false
        }
      },

      logout: () => {
        api.logout()
        set({ user: null, token: null, isAuthenticated: false })
      },

      setUser: (user: Usuario) => set({ user }),
    }),
    {
      name: 'command-analytics-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
