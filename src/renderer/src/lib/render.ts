import type { TextSpec } from './model'

/** Pixels drawn per PDF point, so stamps and text stay sharp when printed or zoomed. */
export const RASTER_SCALE = 4

const FONT_STACK = "'Segoe UI', Tahoma, 'Noto Sans Arabic', 'Noto Sans', Arial, sans-serif"
const hasRtl = (text: string): boolean => /[֐-ࣿיִ-ﻼ]/.test(text)

export interface StampDefinition {
  id: string
  en: string
  ar: string
  color: string
}

export const STAMPS: StampDefinition[] = [
  { id: 'approved', en: 'APPROVED', ar: 'مقبول', color: '#1b7f3b' },
  { id: 'reviewed', en: 'REVIEWED', ar: 'تمت المراجعة', color: '#1f5fbf' },
  { id: 'paid', en: 'PAID', ar: 'مدفوع', color: '#1b7f3b' },
  { id: 'received', en: 'RECEIVED', ar: 'تم الاستلام', color: '#1f5fbf' },
  { id: 'confidential', en: 'CONFIDENTIAL', ar: 'سري', color: '#c62828' },
  { id: 'rejected', en: 'REJECTED', ar: 'مرفوض', color: '#c62828' },
  { id: 'urgent', en: 'URGENT', ar: 'عاجل', color: '#c62828' },
  { id: 'draft', en: 'DRAFT', ar: 'مسودة', color: '#616161' },
  { id: 'final', en: 'FINAL', ar: 'نهائي', color: '#1f5fbf' },
  { id: 'copy', en: 'COPY', ar: 'نسخة', color: '#616161' }
]

/** Draws a bilingual rubber stamp; the dynamic line (date/time/name) is baked in at placement time. */
export function drawStamp(stamp: StampDefinition, dynamicLine: string | null): HTMLCanvasElement {
  const s = RASTER_SCALE
  const measure = document.createElement('canvas').getContext('2d')!
  const titleFont = `800 ${30 * s}px ${FONT_STACK}`
  const arabicFont = `700 ${24 * s}px ${FONT_STACK}`
  const smallFont = `600 ${11 * s}px ${FONT_STACK}`
  measure.font = titleFont
  const titleWidth = measure.measureText(stamp.en).width
  measure.font = arabicFont
  const arabicWidth = measure.measureText(stamp.ar).width
  measure.font = smallFont
  const smallWidth = dynamicLine ? measure.measureText(dynamicLine).width : 0

  const padX = 18 * s
  const width = Math.ceil(Math.max(titleWidth, arabicWidth, smallWidth) + padX * 2)
  const height = Math.ceil((dynamicLine ? 96 : 78) * s)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = stamp.color
  ctx.fillStyle = stamp.color
  ctx.lineJoin = 'round'

  const outer = 3 * s
  ctx.lineWidth = outer
  ctx.beginPath()
  ctx.roundRect(outer / 2, outer / 2, width - outer, height - outer, 10 * s)
  ctx.stroke()
  ctx.lineWidth = 1.2 * s
  ctx.beginPath()
  ctx.roundRect(6 * s, 6 * s, width - 12 * s, height - 12 * s, 7 * s)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = titleFont
  ctx.fillText(stamp.en, width / 2, 38 * s)
  ctx.direction = 'rtl'
  ctx.font = arabicFont
  ctx.fillText(stamp.ar, width / 2, 66 * s)
  if (dynamicLine) {
    ctx.direction = 'ltr'
    ctx.font = smallFont
    ctx.fillText(dynamicLine, width / 2, 84 * s)
  }
  return canvas
}

/** Lays out wrapped text (auto RTL for Arabic) into a transparent image `width` points wide. */
export function drawText(spec: TextSpec, color: string, width: number): HTMLCanvasElement {
  const s = RASTER_SCALE
  const font = `${spec.fontSize * s}px ${FONT_STACK}`
  const ctx0 = document.createElement('canvas').getContext('2d')!
  ctx0.font = font
  const maxWidth = Math.max(1, (width - 8) * s)
  const lines: string[] = []
  for (const paragraph of spec.value.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word
      if (line && ctx0.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd())
        line = word.trimStart()
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  const lineHeight = spec.fontSize * 1.35 * s
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * s)
  canvas.height = Math.ceil(lines.length * lineHeight + 8 * s)
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    const rtl = hasRtl(line)
    ctx.direction = rtl ? 'rtl' : 'ltr'
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillText(line, rtl ? canvas.width - 4 * s : 4 * s, 4 * s + i * lineHeight + spec.fontSize * 0.15 * s)
  })
  return canvas
}

/** Renders typed text as a handwriting-style signature. */
export function drawTypedSignature(name: string, color: string): HTMLCanvasElement {
  const s = RASTER_SCALE
  const font = `italic 600 ${36 * s}px 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', ${FONT_STACK}`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(measure.measureText(name).width + 24 * s)
  canvas.height = Math.ceil(60 * s)
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.direction = hasRtl(name) ? 'rtl' : 'ltr'
  ctx.textAlign = 'center'
  ctx.fillText(name, canvas.width / 2, canvas.height / 2)
  return canvas
}

/** Makes near-white pixels transparent, for scanned signatures and logos. */
export interface WhiteRemovalOptions {
  /** Pixels brighter than this (0–255) and near-grey become fully transparent. */
  threshold?: number
  /** Width of the fade band below the threshold; wider = softer edges. */
  softness?: number
  /** How strongly to strip the white fringe left on anti-aliased ink edges (0–1). */
  decontaminate?: number
}

/**
 * Removes the paper behind a stamp or signature while keeping the coloured ink
 * crisp. Whiteness is judged from the brightest channel and the lack of colour,
 * so a saturated red or blue seal survives even where it is light, while grey
 * paper and scanner noise go fully transparent. Semi-white edge pixels fade out
 * and have their leftover white tint removed, so the ink keeps a clean outline.
 */
export async function removeWhiteBackground(file: Blob, options: WhiteRemovalOptions = {}): Promise<HTMLCanvasElement> {
  const threshold = options.threshold ?? 232
  const softness = options.softness ?? 46
  const decontaminate = options.decontaminate ?? 0.85
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  stripWhitePixels(image.data, { threshold, softness, decontaminate })
  ctx.putImageData(image, 0, 0)
  return canvas
}

/**
 * The pixel pass behind `removeWhiteBackground`, split out so it can be tested
 * without a canvas. Mutates the RGBA buffer in place.
 */
export function stripWhitePixels(d: Uint8ClampedArray, options: Required<WhiteRemovalOptions>): void {
  const { threshold, softness, decontaminate } = options
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max - min // 0 = grey/white, high = coloured ink

    // How much the pixel looks like blank paper: bright and close to grey.
    // A small saturation deadzone keeps scanner noise counting as grey paper.
    const brightness = (max - (threshold - softness)) / softness // 0 below the band, 1 above the threshold
    const greyness = 1 - Math.min(1, Math.max(0, saturation - 8) / 52) // coloured pixels are protected
    const whiteness = Math.max(0, Math.min(1, brightness)) * greyness

    if (whiteness >= 1) {
      d[i + 3] = 0
      continue
    }
    if (whiteness > 0) {
      d[i + 3] = Math.round(d[i + 3] * (1 - whiteness))
      // Un-blend the paper white that was mixed into a semi-transparent edge,
      // so the recovered ink keeps its true colour instead of a pale glow.
      if (decontaminate > 0 && saturation > 0) {
        const k = Math.min(whiteness, 0.85) * decontaminate
        const denom = 1 - k
        d[i] = Math.round((r - 255 * k) / denom)
        d[i + 1] = Math.round((g - 255 * k) / denom)
        d[i + 2] = Math.round((b - 255 * k) / denom)
      }
    }
  }
}

/** Trims fully transparent borders, so drawn signatures have a tight box. */
export function trimCanvas(canvas: HTMLCanvasElement, padding = 8): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let top = height
  let left = width
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return canvas
  const out = document.createElement('canvas')
  out.width = right - left + 1 + padding * 2
  out.height = bottom - top + 1 + padding * 2
  out.getContext('2d')!.drawImage(canvas, left - padding, top - padding, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
