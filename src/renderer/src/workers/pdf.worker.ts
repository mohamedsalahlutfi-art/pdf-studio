import { blankPdf, buildPdf, imagesToPdf, type ExportAsset, type ExportPage, type ImageInput } from '../lib/buildPdf'
import { compressPdf, type CompressOptions, type CompressResult } from '../lib/compress'
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

export type PdfTaskResult =
  | { ok: true; data: Uint8Array; report?: CompressResult['report'] }
  | { ok: false; error: string }

async function run(task: PdfTask): Promise<{ data: Uint8Array; report?: CompressResult['report'] }> {
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
  }
}

self.onmessage = async (event: MessageEvent<PdfTask>) => {
  try {
    const { data, report } = await run(event.data)
    self.postMessage({ ok: true, data, report } satisfies PdfTaskResult, { transfer: [data.buffer] })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies PdfTaskResult)
  }
}
