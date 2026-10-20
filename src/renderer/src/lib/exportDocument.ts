import type { DocState } from './model'
import { getSource } from './sources'
import type { PdfTask, PdfTaskResult } from '../workers/pdf.worker'

export class EncryptedExportError extends Error {}

/** Runs a pdf-lib task in a short-lived worker so the UI never blocks. */
export async function runPdfTask(task: PdfTask, transfer: ArrayBuffer[] = []): Promise<Uint8Array> {
  const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' })
  try {
    const result = await new Promise<PdfTaskResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<PdfTaskResult>) => resolve(event.data)
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage(task, transfer)
    })
    // pdf-lib cannot rewrite encrypted files; encryption support lands with the security tools.
    if (!result.ok) throw /encrypted/i.test(result.error) ? new EncryptedExportError() : new Error(result.error)
    return result.data
  } finally {
    worker.terminate()
  }
}

/**
 * Produces the bytes to write for a document. An unmodified document returns
 * its original bytes untouched, which keeps digital signatures and incremental
 * updates intact. Anything else is rebuilt in a worker.
 */
export async function exportDocument(state: DocState): Promise<Uint8Array> {
  const ids = [...new Set(state.pages.map((p) => p.sourceId))]
  const first = getSource(ids[0])
  if (
    ids.length === 1 &&
    first &&
    !state.labels &&
    state.pages.length === first.pageCount &&
    state.pages.every((p, i) => p.sourceIndex === i && p.rotation === 0)
  ) {
    return first.bytes
  }

  const sources: Record<string, Uint8Array> = {}
  for (const id of ids) {
    const source = getSource(id)
    if (!source) throw new Error(`Missing source ${id}`)
    sources[id] = source.bytes.slice()
  }
  return runPdfTask(
    {
      type: 'build',
      sources,
      pages: state.pages.map(({ sourceId, sourceIndex, rotation }) => ({ sourceId, sourceIndex, rotation })),
      labels: state.labels
    },
    Object.values(sources).map((b) => b.buffer as ArrayBuffer)
  )
}
