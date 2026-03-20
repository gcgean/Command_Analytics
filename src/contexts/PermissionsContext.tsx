import { createContext, useContext } from 'react'
import { useAuthStore } from '../store/authStore'

interface PermissionsContextValue {
  /** true if user has access to everything */
  isSuperUser: boolean
  /** Check if the user has access to a given resource */
  can: (recurso: string) => boolean
  /** All permission strings from the backend */
  permissoes: string[]
}

const PermissionsContext = createContext<PermissionsContextValue>({
  isSuperUser: false,
  can: () => false,
  permissoes: [],
})

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const permissoes: string[] = (user as any)?.permissoes ?? []
  const isSuperUser = permissoes.includes('*')

  function can(recurso: string): boolean {
    if (isSuperUser) return true
    return permissoes.includes(recurso)
  }

  return (
    <PermissionsContext.Provider value={{ isSuperUser, can, permissoes }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
