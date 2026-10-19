import { describe, expect, it } from 'vitest'
import { commit, createHistory, redo, undo } from '../src/renderer/src/lib/history'

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = createHistory(1)
    h = commit(h, 2)
    h = commit(h, 3)
    h = undo(h)
    expect(h.present).toBe(2)
    h = undo(h)
    expect(h.present).toBe(1)
    expect(undo(h)).toBe(h)
    h = redo(redo(h))
    expect(h.present).toBe(3)
    expect(redo(h)).toBe(h)
  })

  it('drops the redo branch on a new commit', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c')
    h = commit(undo(h), 'd')
    expect(h.past).toEqual(['a', 'b'])
    expect(h.future).toEqual([])
  })

  it('ignores commits that do not change the state', () => {
    const h = createHistory({ x: 1 })
    expect(commit(h, h.present)).toBe(h)
  })
})
