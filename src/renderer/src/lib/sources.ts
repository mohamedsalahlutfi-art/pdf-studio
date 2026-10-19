import type { Size } from './model'
import { newId } from './model'
import { loadPdf, type PasswordRequest, type PDFDocumentProxy } from './pdfjs'

/** A loaded PDF file that document pages can point at. Kept outside React state. */
export interface Source {
  id: string
  name: string
  bytes: Uint8Array
  pdf: PDFDocumentProxy
  pageCount: number
  /** Page sizes at scale 1 with the page's own /Rotate applied. */
  sizes: Size[]
  /** True once `sizes` holds measured values for every page. */
  measured: boolean
}

const sources = new Map<string, Source>()

export const getSource = (id: string): Source | undefined => sources.get(id)

/**
 * Loads a PDF. Resolves as soon as the first page is measured so large files
 * open immediately; the remaining page sizes are filled in the background and
 * reported through `onMeasured`.
 */
export async function addSource(
  name: string,
  bytes: Uint8Array,
  requestPassword: PasswordRequest,
  onMeasured: () => void
): Promise<Source> {
  const pdf = await loadPdf(bytes, requestPassword)
  const first = (await pdf.getPage(1)).getViewport({ scale: 1 })
  const source: Source = {
    id: newId('src'),
    name,
    bytes,
    pdf,
    pageCount: pdf.numPages,
    sizes: Array.from({ length: pdf.numPages }, () => ({ width: first.width, height: first.height })),
    measured: pdf.numPages === 1
  }
  sources.set(source.id, source)
  if (!source.measured) void measurePages(source, onMeasured)
  return source
}

async function measurePages(source: Source, onMeasured: () => void): Promise<void> {
  const BATCH = 50
  for (let start = 2; start <= source.pageCount; start += BATCH) {
    if (!sources.has(source.id)) return
    const end = Math.min(source.pageCount, start + BATCH - 1)
    const pages = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) => source.pdf.getPage(start + i))
    )
    let changed = false
    for (const page of pages) {
      const { width, height } = page.getViewport({ scale: 1 })
      const size = source.sizes[page.pageNumber - 1]
      if (size.width !== width || size.height !== height) {
        source.sizes[page.pageNumber - 1] = { width, height }
        changed = true
      }
    }
    if (changed) onMeasured()
  }
  source.measured = true
}

export function releaseSource(id: string): void {
  const source = sources.get(id)
  if (!source) return
  sources.delete(id)
  void source.pdf.loadingTask.destroy()
}
