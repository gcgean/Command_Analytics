import { useEffect, useMemo, useState } from 'react'
import { Download, MonitorDown, Smartphone, X } from 'lucide-react'
import { Button } from './Button'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'command-analytics-pwa-install-dismissed-at'
const DISMISS_DAYS = 7

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isDismissedRecently() {
  const raw = localStorage.getItem(DISMISSED_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  if (!Number.isFinite(dismissedAt)) return false
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  const isIos = useMemo(() => {
    if (typeof window === 'undefined') return false
    return isIosDevice()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateStandalone = () => setIsStandalone(isStandaloneMode())
    updateStandalone()

    if (isDismissedRecently() || isStandaloneMode()) return

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    const handleAppInstalled = () => {
      setVisible(false)
      setInstallEvent(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    if (isIos) setVisible(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [isIos])

  const close = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setVisible(false)
  }

  const install = async () => {
    if (!installEvent) return
    setInstalling(true)
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === 'accepted') {
        setVisible(false)
      } else {
        close()
      }
      setInstallEvent(null)
    } finally {
      setInstalling(false)
    }
  }

  if (!visible || isStandalone) return null
  if (!installEvent && !isIos) return null

  return (
    <div className="fixed bottom-4 right-4 z-[65] w-[calc(100%-1.5rem)] max-w-sm rounded-xl border border-blue-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm dark:border-blue-500/30 dark:bg-slate-900/95">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          {isIos ? <Smartphone className="h-5 w-5" /> : <MonitorDown className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Instalar Command Analytics</p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
            {isIos
              ? 'No iPhone ou iPad, toque em Compartilhar e escolha Adicionar à Tela de Início.'
              : 'Acesse como aplicativo no celular ou computador, com atalho direto e experiência em tela cheia.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!isIos && (
              <Button
                size="sm"
                onClick={install}
                loading={installing}
                icon={<Download className="h-4 w-4" />}
              >
                Instalar app
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={close}>
              {isIos ? 'Entendi' : 'Depois'}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Fechar aviso de instalação"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
