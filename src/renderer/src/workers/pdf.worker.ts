import { blankPdf, buildPdf, imagesToPdf, type ExportPage, type ImageInput } from '../lib/buildPdf'
import type { LabelRange } from '../lib/model'

export type PdfTask =
  | { type: 'build'; sources: Record<string, Uint8Array>; pages: ExportPage[]; labels: LabelRange[] | null }
  | { type: 'images'; images: ImageInput[] }
  | { type: 'blank'; width: number; height: number }

export type PdfTaskResult = { ok: true; data: Uint8Array } | { ok: false; error: string }

function run(task: PdfTask): Promise<Uint8Array> {
  switch (task.type) {
    case 'build':
      return buildPdf(task.sources, task.pages, task.labels)
    case 'images':
      return imagesToPdf(task.images)
    case 'blank':
      return blankPdf(task.width, task.height)
  }
}

self.onmessage = async (event: MessageEvent<PdfTask>) => {
  try {
    const data = await run(event.data)
    self.postMessage({ ok: true, data } satisfies PdfTaskResult, { transfer: [data.buffer] })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies PdfTaskResult)
  }
}
