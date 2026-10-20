import { decodePDFRawStream, PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, type PDFRef, type PDFDocument } from 'pdf-lib'

/**
 * Smart PDF compression. The key idea is hybrid, lossless-for-vector behaviour:
 * text, line art and fonts are never rasterised — only the embedded raster
 * images are downsampled and re-encoded, and the whole file is re-saved with
 * object streams + Flate so the PDF structure itself shrinks. This keeps
 * drawings and text crisp at any zoom while cutting the size of scans, photos
 * and invoices, which is where the bytes actually are.
 */

export interface CompressOptions {
  /** Longest side an image is downsampled to, in pixels. 0 keeps the resolution. */
  maxImagePixels: number
  /** Lossy JPEG quality for re-encoded images, 0–1. */
  imageQuality: number
  /** Only re-encode an image when the result is at least this fraction smaller. */
  minSaving: number
  /** Remove document metadata (Info dict and XMP). */
  stripMetadata: boolean
}

export interface CompressReport {
  imagesTotal: number
  imagesRecompressed: number
  /** Images left untouched because their format is not safely convertible. */
  imagesSkipped: number
  bytesBefore: number
  bytesAfter: number
  /** Kinds of images that were skipped, for an honest "what was not touched" note. */
  skippedKinds: string[]
}

export interface CompressResult {
  data: Uint8Array
  report: CompressReport
}

const PRESETS = {
  screen: { maxImagePixels: 1600, imageQuality: 0.6, minSaving: 0.05, stripMetadata: true },
  print: { maxImagePixels: 2600, imageQuality: 0.82, minSaving: 0.08, stripMetadata: true },
  archive: { maxImagePixels: 0, imageQuality: 0.92, minSaving: 0.12, stripMetadata: false }
} satisfies Record<string, CompressOptions>

export type PresetName = keyof typeof PRESETS
export const presetOptions = (name: PresetName): CompressOptions => ({ ...PRESETS[name] })

const nameOf = (value: unknown): string | null => (value instanceof PDFName ? value.asString().replace(/^\//, '') : null)

/** Reads a numeric dict entry (Width/Height/BitsPerComponent); 0 when absent. */
function numberOf(dict: PDFDict, key: string): number {
  const value = dict.get(PDFName.of(key))
  return value instanceof PDFNumber ? value.asNumber() : 0
}

/** The image XObject streams in the document, de-duplicated by object reference. */
function imageStreams(doc: PDFDocument): { ref: PDFRef; stream: PDFRawStream }[] {
  const out: { ref: PDFRef; stream: PDFRawStream }[] = []
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    if (nameOf(object.dict.get(PDFName.of('Subtype'))) === 'Image') out.push({ ref, stream: object })
  }
  return out
}

/** Flattens a /Filter that may be a single name or an array of names. */
function filtersOf(dict: PDFDict): string[] {
  const filter = dict.get(PDFName.of('Filter'))
  if (filter instanceof PDFArray) return filter.asArray().map((f) => nameOf(f) ?? '')
  const single = nameOf(filter)
  return single ? [single] : []
}

function colorComponents(dict: PDFDict): number | null {
  const cs = nameOf(dict.get(PDFName.of('ColorSpace')))
  if (cs === 'DeviceRGB') return 3
  if (cs === 'DeviceGray') return 1
  return null // Indexed, CMYK, ICCBased, separation: not handled here
}

/** Decodes an image XObject to ImageData, or null when its encoding is not handled. */
async function decodeImage(stream: PDFRawStream): Promise<ImageData | { skip: string } | null> {
  const dict = stream.dict
  const filters = filtersOf(dict)
  const width = numberOf(dict, 'Width')
  const height = numberOf(dict, 'Height')
  if (!width || !height) return null

  // An image/mask attached to this image means re-encoding could drop transparency; skip it.
  if (dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) return { skip: 'transparent' }

  // JPEG payloads are stored verbatim under DCTDecode: the browser decodes them directly.
  if (filters.includes('DCTDecode')) {
    try {
      const bitmap = await createImageBitmap(new Blob([stream.asUint8Array() as BlobPart], { type: 'image/jpeg' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      return ctx.getImageData(0, 0, canvas.width, canvas.height)
    } catch {
      return { skip: 'jpeg-decode-failed' }
    }
  }

  // Raw 8-bit RGB/Gray samples under Flate (or no filter): expand to RGBA by hand.
  const components = colorComponents(dict)
  const bpc = numberOf(dict, 'BitsPerComponent')
  const onlyFlate = filters.length === 0 || (filters.length === 1 && filters[0] === 'FlateDecode')
  if (onlyFlate && components && bpc === 8) {
    const samples = decodePDFRawStream(stream).decode()
    if (samples.length < width * height * components) return { skip: 'truncated' }
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let p = 0; p < width * height; p++) {
      const s = p * components
      const d = p * 4
      rgba[d] = samples[s]
      rgba[d + 1] = components === 3 ? samples[s + 1] : samples[s]
      rgba[d + 2] = components === 3 ? samples[s + 2] : samples[s]
      rgba[d + 3] = 255
    }
    return new ImageData(rgba, width, height)
  }

  // CCITT/JBIG2 (1-bit scans), JPX, indexed and CMYK are left as-is.
  return { skip: filters.join('+') || 'unknown' }
}

/** Downsamples (if needed) and re-encodes an image as JPEG — the only lossy codec a PDF can embed. */
async function encodeJpeg(image: ImageData, maxPixels: number, quality: number): Promise<Uint8Array> {
  const scale = maxPixels > 0 ? Math.min(1, maxPixels / Math.max(image.width, image.height)) : 1
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  if (scale === 1) {
    ctx.putImageData(image, 0, 0)
  } else {
    const source = new OffscreenCanvas(image.width, image.height)
    source.getContext('2d')!.putImageData(image, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, w, h)
  }
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Replaces an image XObject's pixels and encoding in place, keeping its object reference. */
function replaceImage(doc: PDFDocument, ref: PDFRef, bytes: Uint8Array, width: number, height: number): void {
  const dict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'DCTDecode',
    Length: bytes.length
  })
  doc.context.assign(ref, PDFRawStream.of(dict, bytes))
}

function stripMetadata(doc: PDFDocument): void {
  const infoRef = doc.context.trailerInfo.Info
  if (infoRef) {
    const info = doc.context.lookup(infoRef, PDFDict)
    if (info) for (const key of [...info.keys()]) info.delete(key)
  }
  doc.catalog.delete(PDFName.of('Metadata')) // XMP
}

/** Compresses a PDF's bytes. Never rasterises vector or text content — only embedded raster images. */
export async function compressPdf(bytes: Uint8Array, options: CompressOptions): Promise<CompressResult> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const report: CompressReport = {
    imagesTotal: 0,
    imagesRecompressed: 0,
    imagesSkipped: 0,
    bytesBefore: bytes.length,
    bytesAfter: 0,
    skippedKinds: []
  }
  const skipped = new Set<string>()

  for (const { ref, stream } of imageStreams(doc)) {
    report.imagesTotal++
    const width = numberOf(stream.dict, 'Width')
    const height = numberOf(stream.dict, 'Height')
    const decoded = await decodeImage(stream)
    if (!decoded || 'skip' in decoded) {
      report.imagesSkipped++
      if (decoded && 'skip' in decoded) skipped.add(decoded.skip)
      continue
    }
    const scale = options.maxImagePixels > 0 ? Math.min(1, options.maxImagePixels / Math.max(width, height)) : 1
    const outW = Math.max(1, Math.round(width * scale))
    const outH = Math.max(1, Math.round(height * scale))
    const encoded = await encodeJpeg(decoded, options.maxImagePixels, options.imageQuality)
    const original = stream.getContentsSize()
    // Only keep the re-encode when it is a real win, so we never grow an image.
    if (encoded.length < original * (1 - options.minSaving)) {
      replaceImage(doc, ref, encoded, outW, outH)
      report.imagesRecompressed++
    } else {
      report.imagesSkipped++
      skipped.add('already-small')
    }
  }

  if (options.stripMetadata) stripMetadata(doc)

  const output = await doc.save({ useObjectStreams: true })
  report.bytesAfter = output.length
  report.skippedKinds = [...skipped]
  // Guarantee we never hand back something larger than the original.
  if (output.length >= bytes.length) {
    return { data: bytes, report: { ...report, bytesAfter: bytes.length, imagesRecompressed: 0 } }
  }
  return { data: output, report }
}
