/**
 * Limits concurrent page renders so scrolling through a long document never
 * floods the main thread. Lower priority values run first; pending jobs can be
 * cancelled before they start.
 */
type Job = { priority: number; run: () => Promise<void>; cancelled: boolean }

const MAX_CONCURRENT = 3
const queue: Job[] = []
let active = 0

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length) {
    queue.sort((a, b) => a.priority - b.priority)
    const job = queue.shift()!
    if (job.cancelled) continue
    active++
    void job.run().finally(() => {
      active--
      pump()
    })
  }
}

export function enqueueRender(priority: number, run: () => Promise<void>): () => void {
  const job: Job = { priority, run, cancelled: false }
  queue.push(job)
  pump()
  return () => {
    job.cancelled = true
  }
}
