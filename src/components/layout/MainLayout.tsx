import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PermissionsProvider } from '../../contexts/PermissionsContext'
import clsx from 'clsx'

export function MainLayout() {
  // Start collapsed on mobile (< 1024px), expanded on desktop
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  )

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), [])

  // Close sidebar on mobile after navigation
  const closeSidebarOnMobile = useCallback(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false)
  }, [])

  return (
    <PermissionsProvider>
      <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-300">
        <Sidebar
          open={sidebarOpen}
          onToggle={toggleSidebar}
          onNavigate={closeSidebarOnMobile}
        />
        <div
          className={clsx(
            'flex flex-col flex-1 min-w-0 transition-all duration-300',
            sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
          )}
        >
          <Header onToggleSidebar={toggleSidebar} />
          <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </PermissionsProvider>
  )
}
