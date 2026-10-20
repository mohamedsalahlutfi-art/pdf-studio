import type { PageRef } from './model'
import { getSource } from './sources'

export type ImageFormat = 'png' | 'webp' | 'jpeg' | 'tiff'

export interface RasterOptions {
  /** Target resolution. 72 ≈ screen; 150 for email; 300 for print. */
  dpi: number
  /** Lossy quality for webp/jpeg, 0–1. Ignored for png/tiff. */
  quality: number
}

export interface RenderedPage {
  /** 1-based page number in the document. */
  index: number
  width: number
  height: number
  /** Raw RGBA pixels. */
  data: Uint8ClampedArray
}

const mimeFor = (format: Exclude<ImageFormat, 'tiff'>): string =>
  format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'

/** Renders one document page to RGBA pixels at the given DPI, honouring its rotation. */
export async function renderPageBitmap(page: PageRef, dpi: number): Promise<RenderedPage | null> {
  const source = getSource(page.sourceId)
  if (!source) return null
  const pdfPage = await source.pdf.getPage(page.sourceIndex + 1)
  const rotation = (pdfPage.rotate + page.rotation) % 360
  const viewport = pdfPage.getViewport({ scale: dpi / 72, rotation })
  const width = Math.max(1, Math.floor(viewport.width))
  const height = Math.max(1, Math.floor(viewport.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // White matte so transparent PDF backgrounds export as white, not black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  await pdfPage.render({ canvas, viewport }).promise
  return { index: page.sourceIndex + 1, width, height, data: ctx.getImageData(0, 0, width, height).data }
}

/** Encodes RGBA pixels to a single-image blob (png/webp/jpeg). */
export async function encodeImage(
  page: RenderedPage,
  format: Exclude<ImageFormat, 'tiff'>,
  quality: number
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(page.data), page.width, page.height), 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), mimeFor(format), quality)
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Builds a multi-page TIFF from rendered pages: baseline, one uncompressed RGB
 * strip per page, little-endian. BitsPerSample is written as an out-of-line
 * [8,8,8] array as the spec requires, so every viewer reads the colours right.
 */
export function buildTiff(pages: RenderedPage[]): Uint8Array {
  const TAGS = 9
  const ifdSize = 2 + TAGS * 12 + 4
  const BPS = 6 // out-of-line BitsPerSample array: three 16-bit values

  let size = 8 // header
  const layout = pages.map((page) => {
    const pixels = page.width * page.height * 3
    const ifdOffset = size
    size += ifdSize
    const bpsOffset = size
    size += BPS
    const dataOffset = size
    size += pixels
    return { ifdOffset, bpsOffset, dataOffset, pixels }
  })

  const buffer = new Uint8Array(size)
  const view = new DataView(buffer.buffer)
  view.setUint16(0, 0x4949, true) // 'II' little-endian
  view.setUint16(2, 42, true)
  view.setUint32(4, layout[0].ifdOffset, true)

  layout.forEach((entry, i) => {
    const page = pages[i]
    view.setUint16(entry.bpsOffset, 8, true)
    view.setUint16(entry.bpsOffset + 2, 8, true)
    view.setUint16(entry.bpsOffset + 4, 8, true)

    let o = entry.ifdOffset
    view.setUint16(o, TAGS, true)
    o += 2
    const tag = (id: number, type: number, count: number, value: number): void => {
      view.setUint16(o, id, true)
      view.setUint16(o + 2, type, true)
      view.setUint32(o + 4, count, true)
      view.setUint32(o + 8, value, true)
      o += 12
    }
    tag(256, 4, 1, page.width) // ImageWidth
    tag(257, 4, 1, page.height) // ImageLength
    tag(258, 3, 3, entry.bpsOffset) // BitsPerSample [8,8,8]
    tag(259, 3, 1, 1) // Compression: none
    tag(262, 3, 1, 2) // PhotometricInterpretation: RGB
    tag(273, 4, 1, entry.dataOffset) // StripOffsets
    tag(277, 3, 1, 3) // SamplesPerPixel
    tag(278, 4, 1, page.height) // RowsPerStrip (whole image in one strip)
    tag(279, 4, 1, entry.pixels) // StripByteCounts
    const nextIfd = i + 1 < layout.length ? layout[i + 1].ifdOffset : 0
    view.setUint32(o, nextIfd, true)

    let p = entry.dataOffset
    const src = page.data
    for (let srcIndex = 0; srcIndex < src.length; srcIndex += 4) {
      buffer[p++] = src[srcIndex]
      buffer[p++] = src[srcIndex + 1]
      buffer[p++] = src[srcIndex + 2]
    }
  })

  return buffer
}
