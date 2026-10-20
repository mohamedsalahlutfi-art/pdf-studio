import type { Frame } from './geometry'
import type { PageRef, Size } from './model'
import { getSource } from './sources'

/** Unrotated page size and the total display rotation (own /Rotate plus user rotation). */
export function pageFrame(page: PageRef): Frame {
  const source = getSource(page.sourceId)
  const own = source?.rotations[page.sourceIndex] ?? 0
  const shown = source?.sizes[page.sourceIndex] ?? { width: 612, height: 792 }
  const raw: Size = own % 180 === 0 ? shown : { width: shown.height, height: shown.width }
  return { ...raw, rotation: (own + page.rotation) % 360 }
}

export const PAGE_GAP = 16

/** Display size at scale 1, including the user-applied rotation. */
export function displaySize(page: PageRef): Size {
  const size = getSource(page.sourceId)?.sizes[page.sourceIndex] ?? { width: 612, height: 792 }
  return page.rotation % 180 === 0 ? size : { width: size.height, height: size.width }
}

export interface Layout {
  tops: number[]
  sizes: Size[]
  total: number
}

export function computeLayout(sizes: Size[], scale: number, gap = PAGE_GAP): Layout {
  const tops: number[] = []
  const scaled: Size[] = []
  let y = gap
  for (const size of sizes) {
    tops.push(y)
    const s = { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) }
    scaled.push(s)
    y += s.height + gap
  }
  return { tops, sizes: scaled, total: y }
}

/** Index of the last page whose top is at or above `y`. */
export function pageAt(layout: Layout, y: number): number {
  let lo = 0
  let hi = layout.tops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (layout.tops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}

export function visibleRange(layout: Layout, top: number, height: number, overscan: number): [number, number] {
  if (!layout.tops.length) return [0, -1]
  const first = Math.max(0, pageAt(layout, top) - overscan)
  const last = Math.min(layout.tops.length - 1, pageAt(layout, top + height) + overscan)
  return [first, last]
}
