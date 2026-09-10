import { createContext, useCallback, useContext, useState, ReactNode } from 'react'

interface ToastState { message: string; kind: 'ok' | 'err' }
const ToastCtx = createContext<(message: string, kind?: 'ok' | 'err') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastState | null>(null)
  const show = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    setT({ message, kind })
    setTimeout(() => setT(null), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast ${t.kind}`}>{t.message}</div>}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
