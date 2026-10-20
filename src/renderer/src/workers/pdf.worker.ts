import { blankPdf, buildPdf, imagesToPdf, type ExportAsset, type ExportPage, type ImageInput } from '../lib/buildPdf'
import { compressPdf, type CompressOptions, type CompressResult } from '../lib/compress'
import { decryptPdf, encryptPdf, inspectSecurity, type EncryptOptions, type SecurityInfo } from '../lib/security'
import type { LabelRange } from '../lib/model'

export type PdfTask =
  | {
      type: 'build'
      sources: Record<string, Uint8Array>
      pages: ExportPage[]
      labels: LabelRange[] | null
      assets: Record<string, ExportAsset>
    }
  | { type: 'images'; images: ImageInput[] }
  | { type: 'blank'; width: number; height: number }
  | { type: 'compress'; bytes: Uint8Array; options: CompressOptions }
  | { type: 'inspect-security'; bytes: Uint8Array }
  | { type: 'decrypt'; bytes: Uint8Array; password: string }
  | { type: 'encrypt'; bytes: Uint8Array; options: EncryptOptions }

export type PdfTaskResult =
  | { ok: true; data: Uint8Array; report?: CompressResult['report']; security?: SecurityInfo }
  | { ok: false; error: string; kind?: 'wrong-password' }

async function run(task: PdfTask): Promise<{ data: Uint8Array; report?: CompressResult['report']; security?: SecurityInfo }> {
  switch (task.type) {
    case 'build':
      return { data: await buildPdf(task.sources, task.pages, task.labels, task.assets) }
    case 'images':
      return { data: await imagesToPdf(task.images) }
    case 'blank':
      return { data: await blankPdf(task.width, task.height) }
    case 'compress': {
      const result = await compressPdf(task.bytes, task.options)
      return { data: result.data, report: result.report }
    }
    case 'inspect-security': {
      const security = await inspectSecurity(task.bytes)
      return { data: new Uint8Array(0), security }
    }
    case 'decrypt':
      return { data: await decryptPdf(task.bytes, task.password) }
    case 'encrypt':
      return { data: await encryptPdf(task.bytes, task.options) }
  }
}

self.onmessage = async (event: MessageEvent<PdfTask>) => {
  try {
    const { data, report, security } = await run(event.data)
    self.postMessage({ ok: true, data, report, security } satisfies PdfTaskResult, { transfer: [data.buffer] })
  } catch (error) {
    const wrong = error instanceof Error && error.name === 'WrongPasswordError'
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error), kind: wrong ? 'wrong-password' : undefined } satisfies PdfTaskResult)
  }
}
