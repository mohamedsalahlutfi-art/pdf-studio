import {
  BlendMode, degrees, LineCapStyle, PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, rgb,
  PDFDict, type PDFImage, type PDFPage
} from '@cantoo/pdf-lib'
import { arrowHead, inkPathData, NOTE_SIZE } from './geometry'
import type { Annotation, LabelRange, Point } from './model'

export interface ExportPage {
  sourceId: string
  sourceIndex: number
  rotation: number
  annotations?: Annotation[]
}

export interface ExportAsset {
  bytes: Uint8Array
  kind: 'png' | 'jpg'
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
  labels: LabelRange[] | null = null,
  assets: Record<string, ExportAsset> = {}
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

  // Resolve each model page to a concrete PDFPage, copying a page again whenever
  // it is used more than once (a page object cannot appear twice in the tree).
  const images = new Map<string, PDFImage>()
  const used = new Set<string>()
  const ordered: PDFPage[] = []
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
    if (ref.annotations?.length) await drawAnnotations(base, page, ref.annotations, assets, images)
    ordered.push(page)
  }

  // Rewrite the page tree in one shot by assigning the ordered Kids and Count.
  // This keeps the base document's metadata, outline and form intact, and avoids
  // the empty-then-refill path that corrupts the tree's Count in this engine.
  reorderPageTree(base, ordered)

  if (labels?.length) writePageLabels(base, labels)
  else if (!identity) base.catalog.delete(PDFName.of('PageLabels'))

  return base.save({ useObjectStreams: true })
}

/** Replaces the document's page order with exactly `pages`, fixing Kids, Count and each page's Parent. */
function reorderPageTree(doc: PDFDocument, pages: PDFPage[]): void {
  const treeRef = doc.catalog.get(PDFName.of('Pages'))
  if (!(treeRef instanceof PDFRef)) throw new Error('Document has no page tree')
  const tree = doc.context.lookup(treeRef, PDFDict)
  const refs = pages.map((page) => {
    // A freshly copied page may not yet be a registered indirect object.
    const existing = findRef(doc, page)
    return existing ?? doc.context.register(page.node)
  })
  tree.set(PDFName.of('Kids'), doc.context.obj(refs))
  tree.set(PDFName.of('Count'), PDFNumber.of(refs.length))
  for (const ref of refs) doc.context.lookup(ref, PDFDict).set(PDFName.of('Parent'), treeRef)
}

function findRef(doc: PDFDocument, page: PDFPage): PDFRef | undefined {
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (object === page.node) return ref
  }
  return undefined
}

function hexColor(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/**
 * Wraps the page's existing content in q/Q so a graphics state it leaves
 * behind (an unbalanced transform, say) cannot shift what we draw on top.
 */
function isolateContent(doc: PDFDocument, page: PDFPage): void {
  page.node.normalize()
  const contents = page.node.Contents()
  if (!(contents instanceof PDFArray)) return
  contents.insert(0, doc.context.register(doc.context.stream('q')))
  contents.push(doc.context.register(doc.context.stream('Q')))
}

/** Draws annotations into the page content ("flattened"), except notes, which become PDF comments. */
async function drawAnnotations(
  doc: PDFDocument,
  page: PDFPage,
  annotations: Annotation[],
  assets: Record<string, ExportAsset>,
  images: Map<string, PDFImage>
): Promise<void> {
  isolateContent(doc, page)
  const box = page.getCropBox()
  const top = box.y + box.height
  const at = (p: Point) => ({ x: box.x + p.x, y: top - p.y })

  for (const a of annotations) {
    const color = hexColor(a.color)
    switch (a.type) {
      case 'highlight':
        for (const r of a.rects) {
          page.drawRectangle({ x: box.x + r.x, y: top - r.y - r.height, width: r.width, height: r.height, color, opacity: 0.4, blendMode: BlendMode.Multiply })
        }
        break
      case 'underline':
      case 'strikeout':
        for (const r of a.rects) {
          const y = a.type === 'underline' ? r.y + r.height * 0.94 : r.y + r.height * 0.55
          const thickness = Math.max(0.8, r.height * 0.07)
          page.drawLine({ start: at({ x: r.x, y }), end: at({ x: r.x + r.width, y }), thickness, color })
        }
        break
      case 'rect':
        page.drawRectangle({
          x: box.x + a.rect.x,
          y: top - a.rect.y - a.rect.height,
          width: a.rect.width,
          height: a.rect.height,
          borderColor: color,
          borderWidth: a.width,
          color: a.fill ? hexColor(a.fill) : undefined,
          opacity: a.fill ? 0.35 : undefined
        })
        break
      case 'ellipse': {
        const center = at({ x: a.rect.x + a.rect.width / 2, y: a.rect.y + a.rect.height / 2 })
        page.drawEllipse({
          ...center,
          xScale: a.rect.width / 2,
          yScale: a.rect.height / 2,
          borderColor: color,
          borderWidth: a.width,
          color: a.fill ? hexColor(a.fill) : undefined,
          opacity: a.fill ? 0.35 : undefined
        })
        break
      }
      case 'line':
      case 'arrow': {
        const line = { thickness: a.width, color, lineCap: LineCapStyle.Round }
        page.drawLine({ start: at(a.from), end: at(a.to), ...line })
        if (a.type === 'arrow') for (const wing of arrowHead(a.from, a.to, a.width)) page.drawLine({ start: at(a.to), end: at(wing), ...line })
        break
      }
      case 'ink':
        for (const path of a.paths) {
          page.drawSvgPath(inkPathData(path), { x: box.x, y: top, borderColor: color, borderWidth: a.width, borderLineCap: LineCapStyle.Round })
        }
        break
      case 'note': {
        const p = at(a.at)
        const note = doc.context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [p.x, p.y - NOTE_SIZE, p.x + NOTE_SIZE, p.y],
          Contents: PDFHexString.fromText(a.text),
          T: PDFHexString.fromText(a.author),
          M: PDFString.fromDate(new Date(a.date)),
          Name: 'Comment',
          C: [color.red, color.green, color.blue],
          F: 4
        })
        page.node.addAnnot(doc.context.register(note))
        break
      }
      case 'image': {
        const asset = assets[a.assetId]
        if (!asset) break
        let image = images.get(a.assetId)
        if (!image) {
          image = asset.kind === 'png' ? await doc.embedPng(asset.bytes) : await doc.embedJpg(asset.bytes)
          images.set(a.assetId, image)
        }
        // The image is upright when the page is shown at `angle`, so it is rotated by that angle in PDF space
        // and anchored at the corner that pdf-lib rotates around.
        const r = a.rect
        const x0 = box.x + r.x
        const y0 = top - r.y - r.height
        const quarter = a.angle % 180 !== 0
        const width = quarter ? r.height : r.width
        const height = quarter ? r.width : r.height
        const anchor = {
          0: { x: x0, y: y0 },
          90: { x: x0 + r.width, y: y0 },
          180: { x: x0 + r.width, y: y0 + r.height },
          270: { x: x0, y: y0 + r.height }
        }[a.angle]
        page.drawImage(image, { ...anchor, width, height, rotate: degrees(a.angle) })
        break
      }
    }
  }
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
