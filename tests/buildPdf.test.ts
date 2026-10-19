import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildPdf } from '../src/renderer/src/lib/buildPdf'

async function makePdf(widths: number[], title?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  if (title) doc.setTitle(title)
  for (const width of widths) doc.addPage([width, 800])
  return doc.save()
}

const widthsOf = async (bytes: Uint8Array): Promise<number[]> =>
  (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth())

describe('buildPdf', () => {
  it('reorders, drops and rotates pages of a single source', async () => {
    const a = await makePdf([100, 200, 300], 'Original')
    const out = await buildPdf({ a }, [
      { sourceId: 'a', sourceIndex: 2, rotation: 90 },
      { sourceId: 'a', sourceIndex: 0, rotation: 0 }
    ])
    const doc = await PDFDocument.load(out)
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([300, 100])
    expect(doc.getPage(0).getRotation().angle).toBe(90)
    expect(doc.getTitle()).toBe('Original')
  })

  it('merges pages from several sources in model order', async () => {
    const a = await makePdf([100, 200])
    const b = await makePdf([500, 600])
    const out = await buildPdf({ a, b }, [
      { sourceId: 'b', sourceIndex: 1, rotation: 0 },
      { sourceId: 'a', sourceIndex: 0, rotation: 180 },
      { sourceId: 'b', sourceIndex: 0, rotation: 0 }
    ])
    expect(await widthsOf(out)).toEqual([600, 100, 500])
  })

  it('rejects an empty document', async () => {
    await expect(buildPdf({}, [])).rejects.toThrow('no pages')
  })
})
