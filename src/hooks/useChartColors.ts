import * as React from 'react'
import { useApp } from '@/hooks/useApp'

export interface ChartColors {
  primary: string
  success: string
  warning: string
  destructive: string
  muted: string
  border: string
  text: string
  subtle: string
  /** Reihenfolge für Diagramme mit mehreren Kategorien. */
  palette: string[]
}

/**
 * Die Diagrammfarben stammen aus denselben CSS-Variablen wie der Rest der
 * Oberfläche. Recharts schreibt Farben als Attribute in das SVG, dort lösen
 * sich `var(--…)`-Angaben nicht auf — deshalb werden sie hier einmal
 * ausgelesen und als fertige Werte weitergereicht.
 */
export function useChartColors(): ChartColors {
  const { isDark } = useApp()

  return React.useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) => {
      const value = styles.getPropertyValue(name).trim()
      return value ? `hsl(${value})` : fallback
    }

    const primary = read('--primary', '#2563eb')
    const success = read('--success', '#16a34a')
    const warning = read('--warning', '#f59e0b')
    const destructive = read('--destructive', '#dc2626')
    const muted = read('--muted-foreground', '#64748b')
    const border = read('--border', '#e2e8f0')

    return {
      primary,
      success,
      warning,
      destructive,
      muted,
      border,
      text: read('--foreground', '#0f172a'),
      subtle: read('--card', '#ffffff'),
      palette: [primary, success, warning, destructive, muted, border],
    }
    // isDark wird im Rumpf nicht gelesen, ist aber genau der richtige Auslöser:
    // beim Themenwechsel stehen andere Werte in denselben CSS-Variablen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])
}
