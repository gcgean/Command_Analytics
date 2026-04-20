import { useEffect, useState } from 'react'
import { RefreshCw, Wifi, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000

export function PwaUpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, swRegistration) {
      setRegistration(swRegistration ?? null)
    },
    onRegisterError(error) {
      console.error('[PWA] Falha ao registrar Service Worker:', error)
    },
  })

  useEffect(() => {
    if (!registration) return
    const intervalId = window.setInterval(() => {
      void registration.update()
    }, UPDATE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [registration])

  if (!needRefresh && !offlineReady) return null

  const close = () => {
    setNeedRefresh(false)
    setOfflineReady(false)
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 rounded-xl border border-blue-500/30 bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:bg-slate-900/95">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
          {needRefresh ? (
            <RefreshCw className="h-4 w-4 text-blue-500" />
          ) : (
            <Wifi className="h-4 w-4 text-emerald-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {needRefresh ? 'Nova versão disponível' : 'Aplicativo pronto para uso offline'}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {needRefresh
              ? 'Clique em "Atualizar agora" para carregar a versão mais recente sem precisar limpar cache.'
              : 'Você pode continuar usando normalmente, mesmo com instabilidade de rede.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {needRefresh && (
              <Button
                size="sm"
                onClick={() => void updateServiceWorker(true)}
                icon={<RefreshCw className="h-4 w-4" />}
              >
                Atualizar agora
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={close}>
              {needRefresh ? 'Depois' : 'Fechar'}
            </Button>
          </div>
        </div>
        <button
          onClick={close}
          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Fechar aviso de atualização"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

