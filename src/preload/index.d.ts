import type { DesktopApi } from './index'

declare global {
  interface Window {
    /** Present when running inside Electron; undefined in a plain browser. */
    api?: DesktopApi
  }
}
