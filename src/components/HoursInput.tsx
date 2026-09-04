import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { useApp } from '@/hooks/useApp'
import { clampHours, formatHours, parseHours } from '@/lib/weeks'
import { cn } from '@/lib/utils'

/** Schrittweite der beiden Knöpfe — halbe Stunden reichen im Alltag. */
const STEP = 0.5

/**
 * Eingabe für Stunden: zwei flache Knöpfe und ein schmales Feld.
 *
 * Kein `type="number"` — dessen Pfeilchen sind auf allen Systemen anders groß
 * und lassen sich kaum treffen. Getippt werden darf weiterhin alles, auch
 * „7,5“ mit Komma.
 */
export function HoursInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: number
  onChange: (hours: number) => void
  disabled?: boolean
  className?: string
}) {
  const { locale } = useApp()
  const [text, setText] = React.useState(() => formatHours(value, locale))

  // Von außen geänderte Werte übernehmen — aber nicht mitten im Tippen: „7,“
  // ergibt dieselbe Zahl wie „7“ und darf nicht zurückgesetzt werden.
  React.useEffect(() => {
    if (parseHours(text) !== value) setText(formatHours(value, locale))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale])

  function commit(next: number) {
    const clamped = clampHours(next)
    setText(formatHours(clamped, locale))
    onChange(clamped)
  }

  return (
    <div
      className={cn(
        'inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="−"
        disabled={disabled || value <= 0}
        onClick={() => commit(value - STEP)}
        className="flex w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder="–"
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseHours(e.target.value))
        }}
        onBlur={() => setText(formatHours(parseHours(text), locale))}
        // Die Knöpfe liegen nicht im Tabulatorlauf. Damit die Tastatur nicht
        // schlechter dasteht als die Maus, zählen hier die Pfeiltasten.
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          const schritt = e.shiftKey ? 1 : STEP
          commit(parseHours(text) + (e.key === 'ArrowUp' ? schritt : -schritt))
        }}
        className="w-10 border-x border-input bg-transparent text-center text-sm outline-none placeholder:text-muted-foreground/60"
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label="+"
        disabled={disabled || value >= 24}
        onClick={() => commit(value + STEP)}
        className="flex w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
