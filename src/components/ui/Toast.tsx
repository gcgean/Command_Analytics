import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import clsx from 'clsx'

// ============================================================
// TYPES
// ============================================================

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  visible: boolean
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void
    error: (message: string) => void
    warning: (message: string) => void
    info: (message: string) => void
  }
}

// ============================================================
// CONTEXT
// ============================================================

const ToastContext = createContext<ToastContextValue | null>(null)

// ============================================================
// TOAST ITEM COMPONENT
// ============================================================

const toastConfig: Record<ToastType, { icon: React.ReactNode; classes: string }> = {
  success: {
    icon: <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />,
    classes: 'border-emerald-500/30 bg-white dark:bg-slate-800',
  },
  error: {
    icon: <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />,
    classes: 'border-red-500/30 bg-white dark:bg-slate-800',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />,
    classes: 'border-amber-500/30 bg-white dark:bg-slate-800',
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
    classes: 'border-blue-500/30 bg-white dark:bg-slate-800',
  },
}

function ToastItemComponent({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const config = toastConfig[toast.type]

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm text-slate-900 dark:text-slate-100 min-w-[280px] max-w-[400px] transition-all duration-300',
        config.classes,
        toast.visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0'
      )}
    >
      {config.icon}
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================================
// PROVIDER
// ============================================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }, [])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    const newToast: ToastItem = { id, type, message, visible: false }
    setToasts(prev => [...prev, newToast])

    // Trigger enter animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t))
      })
    })

    // Auto-dismiss after 4 seconds
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const toast = {
    success: (message: string) => addToast('success', message),
    error: (message: string) => addToast('error', message),
    warning: (message: string) => addToast('warning', message),
    info: (message: string) => addToast('info', message),
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItemComponent toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ============================================================
// HOOK
// ============================================================

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
