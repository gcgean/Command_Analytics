import { useAuthStore } from '../store/authStore'

export function usePermissions() {
  const { user } = useAuthStore()

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.permissoes.includes('all')) return true
    return user.permissoes.includes(permission)
  }

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some(p => hasPermission(p))
  }

  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissions.every(p => hasPermission(p))
  }

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions: user?.permissoes ?? [],
  }
}
