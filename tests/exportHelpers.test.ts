import { describe, expect, it } from 'vitest'
import { formatBytes, savingPercent } from '../src/renderer/src/lib/compressState'
import { buildTiff, type RenderedPage } from '../src/renderer/src/lib/exportImages'

describe('size helpers', () => {
  it('formats byte counts', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB')
    expect(formatBytes(2.8 * 1024 * 1024)).toBe('2.8 MB')
  })

  it('reports saving percent, never negative', () => {
    expect(savingPercent(1000, 250)).toBe(75)
    expect(savingPercent(1000, 1200)).toBe(0)
    expect(savingPercent(0, 0)).toBe(0)
  })
})

/** Minimal baseline-TIFF reader, to prove buildTiff produces a parseable file. */
function readTiff(buffer: Uint8Array): { pages: { width: number; height: number; samples: number; bps: number[] }[] } {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  expect(view.getUint16(0, true)).toBe(0x4949)
  expect(view.getUint16(2, true)).toBe(42)
  const pages = []
  let ifd = view.getUint32(4, true)
  while (ifd !== 0) {
    const count = view.getUint16(ifd, true)
    const tags = new Map<number, { type: number; count: number; value: number }>()
    for (let i = 0; i < count; i++) {
      const o = ifd + 2 + i * 12
      tags.set(view.getUint16(o, true), { type: view.getUint16(o + 2, true), count: view.getUint32(o + 4, true), value: view.getUint32(o + 8, true) })
    }
    const bpsTag = tags.get(258)!
    const bps = [0, 1, 2].map((k) => view.getUint16(bpsTag.value + k * 2, true))
    pages.push({ width: tags.get(256)!.value, height: tags.get(257)!.value, samples: tags.get(277)!.value, bps })
    // Pixel strip length must match width*height*samples.
    expect(tags.get(279)!.value).toBe(tags.get(256)!.value * tags.get(257)!.value * 3)
    ifd = view.getUint32(ifd + 2 + count * 12, true)
  }
  return { pages }
}

describe('multi-page TIFF', () => {
  const page = (w: number, h: number): RenderedPage => ({
    index: 1,
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4).fill(200)
  })

  it('writes a parseable 2-page RGB TIFF with [8,8,8] samples', () => {
    const tiff = buildTiff([page(4, 3), page(2, 2)])
    const { pages } = readTiff(tiff)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({ width: 4, height: 3, samples: 3, bps: [8, 8, 8] })
    expect(pages[1]).toMatchObject({ width: 2, height: 2 })
  })
})
