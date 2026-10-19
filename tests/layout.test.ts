import { describe, expect, it } from 'vitest'
import { computeLayout, pageAt, visibleRange } from '../src/renderer/src/lib/layout'

const sizes = Array.from({ length: 1000 }, () => ({ width: 600, height: 800 }))

describe('layout', () => {
  it('stacks pages with gaps at the given scale', () => {
    const layout = computeLayout(sizes.slice(0, 3), 0.5, 10)
    expect(layout.tops).toEqual([10, 420, 830])
    expect(layout.total).toBe(1240)
  })

  it('finds the page at a scroll offset', () => {
    const layout = computeLayout(sizes, 1, 10)
    expect(pageAt(layout, 0)).toBe(0)
    expect(pageAt(layout, 809)).toBe(0)
    expect(pageAt(layout, 820)).toBe(1)
    expect(pageAt(layout, layout.total)).toBe(999)
  })

  it('mounts only the pages near the viewport', () => {
    const layout = computeLayout(sizes, 1, 10)
    const [first, last] = visibleRange(layout, 81000, 900, 2)
    expect(first).toBe(97)
    expect(last).toBe(103)
  })
})
