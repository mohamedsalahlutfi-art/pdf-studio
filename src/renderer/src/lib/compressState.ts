import type { CompressReport } from './compress'

/** A finished compression result as shown in the UI toast / panel. */
export interface CompressReportState extends CompressReport {
  /** Where the compressed file was written, if known. */
  path: string | null
}

export const compressReport = (report: CompressReport, path: string | null): CompressReportState => ({ ...report, path })

/** Human-readable size, e.g. "2.8 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Percentage saved, clamped at 0 so a no-op never shows a negative number. */
export const savingPercent = (before: number, after: number): number =>
  before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0
