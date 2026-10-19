import type { DocState } from './model'
import { getSource } from './sources'
import type { ExportRequest, ExportResponse } from '../workers/export.worker'

export class EncryptedExportError extends Error {}

/**
 * Produces the bytes to write for a document. An unmodified document returns
 * its original bytes untouched, which keeps digital signatures and incremental
 * updates intact. Anything else is rebuilt in a worker off the UI thread.
 */
export async function exportDocument(state: DocState): Promise<Uint8Array> {
  const ids = [...new Set(state.pages.map((p) => p.sourceId))]
  const first = getSource(ids[0])
  if (
    ids.length === 1 &&
    first &&
    state.pages.length === first.pageCount &&
    state.pages.every((p, i) => p.sourceIndex === i && p.rotation === 0)
  ) {
    return first.bytes
  }

  const sources: ExportRequest['sources'] = {}
  for (const id of ids) {
    const source = getSource(id)
    if (!source) throw new Error(`Missing source ${id}`)
    sources[id] = source.bytes.slice()
  }

  const worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' })
  try {
    const response = await new Promise<ExportResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<ExportResponse>) => resolve(event.data)
      worker.onerror = (event) => reject(new Error(event.message))
      const request: ExportRequest = {
        sources,
        pages: state.pages.map(({ sourceId, sourceIndex, rotation }) => ({ sourceId, sourceIndex, rotation }))
      }
      worker.postMessage(request, Object.values(sources).map((b) => b.buffer as ArrayBuffer))
    })
    // pdf-lib cannot rewrite encrypted files; encryption support lands with the security tools.
    if (!response.ok) throw /encrypted/i.test(response.error) ? new EncryptedExportError() : new Error(response.error)
    return response.data
  } finally {
    worker.terminate()
  }
}
