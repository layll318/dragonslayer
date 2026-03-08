'use client'

import { useEffect, useState, useCallback } from 'react'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    query_id?: string
    user?: TelegramUser
    auth_date?: number
    hash?: string
    start_param?: string
  }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
  }
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  headerColor: string
  backgroundColor: string
  isClosingConfirmationEnabled: boolean
  BackButton: {
    isVisible: boolean
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
    show: () => void
    hide: () => void
  }
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isActive: boolean
    isProgressVisible: boolean
    setText: (text: string) => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  close: () => void
  expand: () => void
  ready: () => void
  sendData: (data: string) => void
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
  openTelegramLink: (url: string) => void
  showAlert: (message: string, callback?: () => void) => void
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void
  enableClosingConfirmation: () => void
  disableClosingConfirmation: () => void
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  isVersionAtLeast: (version: string) => boolean
  onEvent: (eventType: string, eventHandler: () => void) => void
  offEvent: (eventType: string, eventHandler: () => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export interface UseTelegramWebAppReturn {
  webApp: TelegramWebApp | null
  user: TelegramUser | null
  isReady: boolean
  isTWA: boolean
  hapticFeedback: (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning') => void
  showAlert: (message: string) => Promise<void>
  showConfirm: (message: string) => Promise<boolean>
  close: () => void
  expand: () => void
}

export function useTelegramWebApp(): UseTelegramWebAppReturn {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp
      tg.ready()
      tg.expand()

      if (tg.isVersionAtLeast('6.1')) {
        tg.setHeaderColor('#0d0900')
        tg.setBackgroundColor('#0d0900')
      }

      // Keep --tg-viewport-stable-height in sync so CSS layout uses the real height
      const syncVh = () => {
        const h = tg.viewportStableHeight || tg.viewportHeight
        if (h) {
          document.documentElement.style.setProperty('--tg-viewport-stable-height', `${h}px`)
        }
      }
      syncVh()
      tg.onEvent('viewportChanged', syncVh)

      setWebApp(tg)
      setIsReady(true)
    } else {
      setIsReady(true)
    }
  }, [])

  const hapticFeedback = useCallback(
    (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning') => {
      if (!webApp?.HapticFeedback) return
      if (type === 'success' || type === 'error' || type === 'warning') {
        webApp.HapticFeedback.notificationOccurred(type)
      } else {
        webApp.HapticFeedback.impactOccurred(type)
      }
    },
    [webApp]
  )

  const showAlert = useCallback(
    (message: string): Promise<void> =>
      new Promise((resolve) => {
        if (webApp) webApp.showAlert(message, resolve)
        else { alert(message); resolve() }
      }),
    [webApp]
  )

  const showConfirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        if (webApp) webApp.showConfirm(message, resolve)
        else resolve(confirm(message))
      }),
    [webApp]
  )

  const close = useCallback(() => webApp?.close(), [webApp])
  const expand = useCallback(() => webApp?.expand(), [webApp])

  return {
    webApp,
    user: webApp?.initDataUnsafe.user ?? null,
    isReady,
    isTWA: !!webApp,
    hapticFeedback,
    showAlert,
    showConfirm,
    close,
    expand,
  }
}
