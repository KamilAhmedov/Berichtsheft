import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/hooks/useApp'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const

const TONES = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
} as const

export function Toaster() {
  const { toasts, dismissToast } = useApp()

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind]
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-popover p-3.5 shadow-lg animate-fade-in"
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONES[toast.kind])} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm leading-snug">{toast.message}</p>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.run()
                    dismissToast(toast.id)
                  }}
                  className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
