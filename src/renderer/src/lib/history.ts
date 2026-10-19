/** Undo/redo stack over immutable snapshots. Unlimited depth: snapshots share structure. */
export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

export function commit<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history
  return { past: [...history.past, history.present], present: next, future: [] }
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future]
  }
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1)
  }
}
