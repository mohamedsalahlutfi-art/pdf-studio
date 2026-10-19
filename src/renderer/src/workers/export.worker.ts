import { buildPdf, type ExportPage } from '../lib/buildPdf'

export interface ExportRequest {
  sources: Record<string, Uint8Array>
  pages: ExportPage[]
}

export type ExportResponse = { ok: true; data: Uint8Array } | { ok: false; error: string }

self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    const data = await buildPdf(event.data.sources, event.data.pages)
    self.postMessage({ ok: true, data } satisfies ExportResponse, { transfer: [data.buffer] })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ExportResponse)
  }
}
