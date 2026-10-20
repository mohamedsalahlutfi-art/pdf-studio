import { degrees, PDFDocument, PDFName, PDFNumber, PDFString, type PDFDict, type PDFPage } from 'pdf-lib'
import type { LabelRange } from './model'

export interface ExportPage {
  sourceId: string
  sourceIndex: number
  rotation: number
}

/**
 * Builds the output PDF from the document model. The source of the first page
 * becomes the base document, so its metadata, outline and form survive; pages
 * from other sources are copied in. A page used more than once is copied again
 * for each extra use, since one page object cannot appear twice in a page tree.
 */
export async function buildPdf(
  sources: Record<string, Uint8Array>,
  pages: ExportPage[],
  labels: LabelRange[] | null = null
): Promise<Uint8Array> {
  if (!pages.length) throw new Error('Document has no pages')
  const baseId = pages[0].sourceId
  const docs = new Map<string, PDFDocument>()
  const load = async (id: string): Promise<PDFDocument> => {
    if (!docs.has(id)) docs.set(id, await PDFDocument.load(sources[id], { updateMetadata: false }))
    return docs.get(id)!
  }
  const base = await load(baseId)
  const basePages = base.getPages()
  const identity = pages.length === basePages.length && pages.every((p, i) => p.sourceId === baseId && p.sourceIndex === i)

  // First use of each foreign page is copied in one batch per source.
  const copied = new Map<string, Map<number, PDFPage>>()
  for (const id of new Set(pages.map((p) => p.sourceId))) {
    if (id === baseId) continue
    const indices = [...new Set(pages.filter((p) => p.sourceId === id).map((p) => p.sourceIndex))]
    const result = await base.copyPages(await load(id), indices)
    copied.set(id, new Map(indices.map((index, i) => [index, result[i]])))
  }

  for (let i = base.getPageCount() - 1; i >= 0; i--) base.removePage(i)

  const used = new Set<string>()
  for (const ref of pages) {
    const key = `${ref.sourceId}:${ref.sourceIndex}`
    let page: PDFPage
    if (used.has(key)) {
      ;[page] = await base.copyPages(await load(ref.sourceId), [ref.sourceIndex])
    } else {
      page = ref.sourceId === baseId ? basePages[ref.sourceIndex] : copied.get(ref.sourceId)!.get(ref.sourceIndex)!
      used.add(key)
    }
    if (ref.rotation) page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360))
    base.addPage(page)
  }

  if (labels?.length) writePageLabels(base, labels)
  else if (!identity) base.catalog.delete(PDFName.of('PageLabels'))

  return base.save({ useObjectStreams: true })
}

function writePageLabels(doc: PDFDocument, labels: LabelRange[]): void {
  const nums: (PDFNumber | PDFDict)[] = []
  for (const range of labels) {
    const entry = doc.context.obj({}) as PDFDict
    if (range.style !== 'none') entry.set(PDFName.of('S'), PDFName.of(range.style))
    if (range.prefix) entry.set(PDFName.of('P'), PDFString.of(range.prefix))
    if (range.start !== 1) entry.set(PDFName.of('St'), PDFNumber.of(range.start))
    nums.push(PDFNumber.of(range.startIndex), entry)
  }
  doc.catalog.set(PDFName.of('PageLabels'), doc.context.obj({ Nums: nums }))
}

const A4 = { width: 595.28, height: 841.89 }

export interface ImageInput {
  bytes: Uint8Array
  kind: 'png' | 'jpg'
}

/** One A4 page per image, oriented to match it, centred and never upscaled past its pixel size. */
export async function imagesToPdf(images: ImageInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const input of images) {
    const image = input.kind === 'png' ? await doc.embedPng(input.bytes) : await doc.embedJpg(input.bytes)
    const landscape = image.width > image.height
    const page = doc.addPage(landscape ? [A4.height, A4.width] : [A4.width, A4.height])
    const margin = 24
    const natural = { width: image.width * 0.75, height: image.height * 0.75 }
    const scale = Math.min(1, (page.getWidth() - margin * 2) / natural.width, (page.getHeight() - margin * 2) / natural.height)
    const width = natural.width * scale
    const height = natural.height * scale
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height })
  }
  return doc.save()
}

export async function blankPdf(width: number, height: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([width, height])
  return doc.save()
}
