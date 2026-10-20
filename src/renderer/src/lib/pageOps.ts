import { newId, rotate, type DocState, type PageRef } from './model'

/** Pure edits on a document. Each returns a new DocState (or the same one when nothing changes). */

const withPages = (state: DocState, pages: PageRef[]): DocState => ({ ...state, pages })

export function removePages(state: DocState, ids: ReadonlySet<string>): DocState {
  const pages = state.pages.filter((p) => !ids.has(p.id))
  return pages.length === state.pages.length ? state : withPages(state, pages)
}

export function rotatePages(state: DocState, ids: ReadonlySet<string>, delta: number): DocState {
  return withPages(
    state,
    state.pages.map((p) => (ids.has(p.id) ? { ...p, rotation: rotate(p.rotation, delta) } : p))
  )
}

export const clonePage = (page: PageRef): PageRef => ({ ...page, id: newId('pg') })

/** Inserts copies of the given pages, in document order, right after the last of them. */
export function duplicatePages(state: DocState, ids: ReadonlySet<string>): { state: DocState; created: PageRef[] } {
  const chosen = state.pages.filter((p) => ids.has(p.id))
  if (!chosen.length) return { state, created: [] }
  const last = state.pages.findIndex((p) => p.id === chosen[chosen.length - 1].id)
  const created = chosen.map(clonePage)
  return { state: insertPages(state, last + 1, created), created }
}

export function insertPages(state: DocState, index: number, pages: PageRef[]): DocState {
  const at = Math.max(0, Math.min(index, state.pages.length))
  return withPages(state, [...state.pages.slice(0, at), ...pages, ...state.pages.slice(at)])
}

/**
 * Moves the given pages (keeping their relative order) so they land before
 * the page currently at `toIndex`; `toIndex === length` moves them to the end.
 */
export function movePages(state: DocState, ids: ReadonlySet<string>, toIndex: number): DocState {
  const moving = state.pages.filter((p) => ids.has(p.id))
  if (!moving.length) return state
  const before = state.pages.slice(0, toIndex).filter((p) => !ids.has(p.id)).length
  const rest = state.pages.filter((p) => !ids.has(p.id))
  const pages = [...rest.slice(0, before), ...moving, ...rest.slice(before)]
  return pages.every((p, i) => p === state.pages[i]) ? state : withPages(state, pages)
}

/** Parses "1-3, 5, 8-" (1-based, inclusive) into groups of zero-based indices. */
export function parseRanges(text: string, pageCount: number): number[][] | null {
  const groups: number[][] = []
  for (const part of text.split(/[,،;]/).map((s) => s.trim()).filter(Boolean)) {
    const match = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(part)
    if (!match || (!match[1] && !match[3])) return null
    const from = match[1] ? Number(match[1]) : 1
    const to = match[2] ? (match[3] ? Number(match[3]) : pageCount) : from
    if (from < 1 || to > pageCount || from > to) return null
    groups.push(Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i))
  }
  return groups.length ? groups : null
}

export function chunk(count: number, size: number): number[][] {
  const groups: number[][] = []
  for (let start = 0; start < count; start += size) {
    groups.push(Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i))
  }
  return groups
}

/** Splits so that each listed index starts a new part. */
export function splitBefore(count: number, starts: number[]): number[][] {
  const cuts = [...new Set([0, ...starts.filter((i) => i > 0 && i < count)])].sort((a, b) => a - b)
  return cuts.map((start, i) => {
    const end = cuts[i + 1] ?? count
    return Array.from({ length: end - start }, (_, k) => start + k)
  })
}
