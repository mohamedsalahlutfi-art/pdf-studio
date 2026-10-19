import { degrees, PDFDocument, type PDFPage } from 'pdf-lib'

export interface ExportPage {
  sourceId: string
  sourceIndex: number
  rotation: number
}

/**
 * Builds the output PDF from the document model. The source of the first page
 * becomes the base document, so its metadata, outline and form survive; pages
 * from other sources are copied in.
 */
export async function buildPdf(sources: Record<string, Uint8Array>, pages: ExportPage[]): Promise<Uint8Array> {
  if (!pages.length) throw new Error('Document has no pages')
  const baseId = pages[0].sourceId
  const base = await PDFDocument.load(sources[baseId], { updateMetadata: false })
  const basePages = base.getPages()

  const copied = new Map<string, Map<number, PDFPage>>()
  for (const id of new Set(pages.map((p) => p.sourceId))) {
    if (id === baseId) continue
    const doc = await PDFDocument.load(sources[id])
    const indices = [...new Set(pages.filter((p) => p.sourceId === id).map((p) => p.sourceIndex))]
    const result = await base.copyPages(doc, indices)
    copied.set(id, new Map(indices.map((index, i) => [index, result[i]])))
  }

  for (let i = base.getPageCount() - 1; i >= 0; i--) base.removePage(i)

  for (const ref of pages) {
    const page = ref.sourceId === baseId ? basePages[ref.sourceIndex] : copied.get(ref.sourceId)!.get(ref.sourceIndex)!
    if (ref.rotation) page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360))
    base.addPage(page)
  }

  return base.save({ useObjectStreams: true })
}
