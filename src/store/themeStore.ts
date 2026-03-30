import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  theme: 'light' | 'dark'
  hasExplicitPreference: boolean
  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Sempre iniciar em claro; só manter escuro quando houver escolha explícita do usuário.
      theme: 'light',
      hasExplicitPreference: false,
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light', hasExplicitPreference: true })),
      setTheme: (theme) => set({ theme, hasExplicitPreference: true }),
    }),
    {
      name: 'theme-storage',
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<ThemeState>
        return {
          theme: state.hasExplicitPreference ? (state.theme ?? 'light') : 'light',
          hasExplicitPreference: state.hasExplicitPreference ?? false,
        } as ThemeState
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!state.hasExplicitPreference) {
          state.theme = 'light'
          state.hasExplicitPreference = false
          return
        }
        if (state.theme !== 'light' && state.theme !== 'dark') {
          state.theme = 'light'
        }
      },
    }
  )
)
