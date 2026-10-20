import { describe, expect, it } from 'vitest'
import { stripWhitePixels, type WhiteRemovalOptions } from '../src/renderer/src/lib/render'

const OPTS: Required<WhiteRemovalOptions> = { threshold: 232, softness: 46, decontaminate: 0.85 }
const px = (r: number, g: number, b: number, a = 255): Uint8ClampedArray => {
  const d = new Uint8ClampedArray([r, g, b, a])
  stripWhitePixels(d, OPTS)
  return d
}

describe('white background removal', () => {
  it('erases pure white and bright grey paper', () => {
    expect(px(255, 255, 255)[3]).toBe(0)
    expect(px(246, 246, 244)[3]).toBe(0)
  })

  it('keeps saturated ink fully opaque even when it is light', () => {
    expect(px(220, 40, 40)[3]).toBe(255) // red seal
    expect(px(40, 90, 210)[3]).toBe(255) // blue seal
    expect(px(255, 120, 120)[3]).toBe(255) // light red still ink
  })

  it('keeps dark strokes opaque', () => {
    expect(px(20, 20, 20)[3]).toBe(255)
  })

  it('fades a light grey edge instead of cutting it hard', () => {
    const alpha = px(224, 224, 224)[3]
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(255)
  })

  it('removes the white tint from a near-white coloured edge', () => {
    // A red pixel diluted toward white: alpha drops and the colour is pulled back toward red.
    const out = px(250, 232, 232)
    expect(out[3]).toBeLessThan(255)
    expect(out[0] - out[1]).toBeGreaterThan(250 - 232) // more saturated than the input
  })
})
