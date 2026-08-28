/// <reference types="vite/client" />
import type { BerichtsheftApi } from '../electron/preload'

declare global {
  interface Window {
    api: BerichtsheftApi
  }
}

export {}
