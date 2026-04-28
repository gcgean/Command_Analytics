declare module 'virtual:pwa-register/react' {
  export type UseRegisterSWOptions = {
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: unknown) => void
  }

  export function useRegisterSW(options?: UseRegisterSWOptions): {
    needRefresh: [boolean, (value: boolean) => void]
    offlineReady: [boolean, (value: boolean) => void]
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}

