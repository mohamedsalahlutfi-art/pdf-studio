import { getAsset } from './assets'
import type { ExportAsset } from './buildPdf'
import type { DocState } from './model'
import { getSource } from './sources'
import type { EncryptOptions, SecurityInfo } from './security'
import { WrongPasswordError } from './security'
import type { PdfTask, PdfTaskResult } from '../workers/pdf.worker'

export class EncryptedExportError extends Error {}

/** Runs a pdf-lib task in a short-lived worker so the UI never blocks. */
export async function runPdfTask(task: PdfTask, transfer: ArrayBuffer[] = []): Promise<Uint8Array> {
  return (await runPdfTaskFull(task, transfer)).data
}

/** Like runPdfTask but also returns a task report (e.g. compression stats). */
export async function runPdfTaskFull(
  task: PdfTask,
  transfer: ArrayBuffer[] = []
): Promise<{ data: Uint8Array; report?: Extract<PdfTaskResult, { ok: true }>['report'] }> {
  const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' })
  try {
    const result = await new Promise<PdfTaskResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<PdfTaskResult>) => resolve(event.data)
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage(task, transfer)
    })
    // pdf-lib cannot rewrite encrypted files; encryption support lands with the security tools.
    if (!result.ok) throw /encrypted/i.test(result.error) ? new EncryptedExportError() : new Error(result.error)
    return { data: result.data, report: result.report }
  } finally {
    worker.terminate()
  }
}

/** Runs one security task in the worker, surfacing the security info and wrong-password outcome. */
async function runSecurityTask(task: PdfTask, transfer: ArrayBuffer[] = []): Promise<{ data: Uint8Array; security?: SecurityInfo }> {
  const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' })
  try {
    const result = await new Promise<PdfTaskResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<PdfTaskResult>) => resolve(event.data)
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage(task, transfer)
    })
    if (!result.ok) throw result.kind === 'wrong-password' ? new WrongPasswordError() : new Error(result.error)
    return { data: result.data, security: result.security }
  } finally {
    worker.terminate()
  }
}

export async function inspectSecurity(bytes: Uint8Array): Promise<SecurityInfo> {
  const copy = bytes.slice()
  const { security } = await runSecurityTask({ type: 'inspect-security', bytes: copy }, [copy.buffer as ArrayBuffer])
  return security!
}

export async function decryptBytes(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const copy = bytes.slice()
  return (await runSecurityTask({ type: 'decrypt', bytes: copy, password }, [copy.buffer as ArrayBuffer])).data
}

export async function encryptBytes(bytes: Uint8Array, options: EncryptOptions): Promise<Uint8Array> {
  const copy = bytes.slice()
  return (await runSecurityTask({ type: 'encrypt', bytes: copy, options }, [copy.buffer as ArrayBuffer])).data
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
    state.pages.every((p) => !p.annotations?.length) &&
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
  const assets: Record<string, ExportAsset> = {}
  for (const annotation of state.pages.flatMap((p) => p.annotations ?? [])) {
    if (annotation.type !== 'image' || assets[annotation.assetId]) continue
    const asset = getAsset(annotation.assetId)
    if (asset) assets[annotation.assetId] = { bytes: asset.bytes.slice(), kind: asset.kind }
  }
  return runPdfTask(
    {
      type: 'build',
      sources,
      pages: state.pages.map(({ sourceId, sourceIndex, rotation, annotations }) => ({ sourceId, sourceIndex, rotation, annotations })),
      labels: state.labels,
      assets
    },
    [...Object.values(sources), ...Object.values(assets).map((a) => a.bytes)].map((b) => b.buffer as ArrayBuffer)
  )
}
