import { describe, expect, it } from 'vitest'
import type { DocState, PageRef } from '../src/renderer/src/lib/model'
import { pageLabel } from '../src/renderer/src/lib/pageLabels'
import * as ops from '../src/renderer/src/lib/pageOps'

const doc = (n: number): DocState => ({
  pages: Array.from({ length: n }, (_, i): PageRef => ({ id: `p${i + 1}`, sourceId: 's', sourceIndex: i, rotation: 0 })),
  labels: null
})
const ids = (state: DocState): string[] => state.pages.map((p) => p.id)

describe('page operations', () => {
  it('moves a selection before a target index, keeping order', () => {
    expect(ids(ops.movePages(doc(5), new Set(['p4', 'p2']), 0))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5'])
    expect(ids(ops.movePages(doc(5), new Set(['p1']), 5))).toEqual(['p2', 'p3', 'p4', 'p5', 'p1'])
    expect(ids(ops.movePages(doc(5), new Set(['p1', 'p2']), 4))).toEqual(['p3', 'p4', 'p1', 'p2', 'p5'])
  })

  it('returns the same state when a move changes nothing', () => {
    const state = doc(3)
    expect(ops.movePages(state, new Set(['p2']), 1)).toBe(state)
    expect(ops.movePages(state, new Set(['p2']), 2)).toBe(state)
  })

  it('duplicates pages after the last selected one', () => {
    const { state, created } = ops.duplicatePages(doc(4), new Set(['p1', 'p3']))
    expect(state.pages.map((p) => p.sourceIndex)).toEqual([0, 1, 2, 0, 2, 3])
    expect(created).toHaveLength(2)
    expect(new Set(ids(state)).size).toBe(6)
  })

  it('rotates and removes only the targeted pages', () => {
    const rotated = ops.rotatePages(doc(3), new Set(['p2']), -90)
    expect(rotated.pages.map((p) => p.rotation)).toEqual([0, 270, 0])
    expect(ids(ops.removePages(doc(3), new Set(['p1', 'p3'])))).toEqual(['p2'])
  })

  it('parses split ranges', () => {
    expect(ops.parseRanges('1-3, 5, 7-', 9)).toEqual([[0, 1, 2], [4], [6, 7, 8]])
    expect(ops.parseRanges('2-1', 5)).toBeNull()
    expect(ops.parseRanges('1-20', 5)).toBeNull()
    expect(ops.parseRanges('', 5)).toBeNull()
  })

  it('splits into chunks and before selected pages', () => {
    expect(ops.chunk(5, 2)).toEqual([[0, 1], [2, 3], [4]])
    expect(ops.splitBefore(6, [3, 0, 5])).toEqual([[0, 1, 2], [3, 4], [5]])
  })
})

describe('page labels', () => {
  it('formats roman front matter followed by arabic numbering', () => {
    const labels = [
      { startIndex: 0, style: 'r' as const, prefix: '', start: 1 },
      { startIndex: 4, style: 'D' as const, prefix: '', start: 1 },
      { startIndex: 8, style: 'A' as const, prefix: 'App-', start: 1 }
    ]
    expect([0, 3, 4, 7, 8, 9].map((i) => pageLabel(i, labels))).toEqual(['i', 'iv', '1', '4', 'App-A', 'App-B'])
    expect(pageLabel(2, null)).toBe('3')
  })
})
