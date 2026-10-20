import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { blankPdf, buildPdf, imagesToPdf } from '../src/renderer/src/lib/buildPdf'

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

  it('writes duplicated pages as separate page objects', async () => {
    const a = await makePdf([100, 200])
    const out = await buildPdf({ a }, [
      { sourceId: 'a', sourceIndex: 0, rotation: 0 },
      { sourceId: 'a', sourceIndex: 0, rotation: 90 }
    ])
    const doc = await PDFDocument.load(out)
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90])
    expect(doc.getPage(0).ref).not.toBe(doc.getPage(1).ref)
  })

  it('writes page labels', async () => {
    const a = await makePdf([100, 100, 100])
    const out = await buildPdf({ a }, [0, 1, 2].map((i) => ({ sourceId: 'a', sourceIndex: i, rotation: 0 })), [
      { startIndex: 0, style: 'r', prefix: '', start: 1 },
      { startIndex: 2, style: 'D', prefix: 'P-', start: 5 }
    ])
    const labels = (await PDFDocument.load(out)).catalog.lookup(PDFName.of('PageLabels'), PDFDict)
    expect(labels.toString()).toContain('/S /r')
    expect(labels.toString()).toContain('/St 5')
  })

  it('creates PDFs from images and blank pages', async () => {
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DAwMDAwAAAEPkB/80MYYgAAAAASUVORK5CYII='),
      (c) => c.charCodeAt(0)
    )
    const fromImage = await PDFDocument.load(await imagesToPdf([{ bytes: png, kind: 'png' }]))
    expect(fromImage.getPageCount()).toBe(1)
    expect(fromImage.getPage(0).getWidth()).toBeGreaterThan(fromImage.getPage(0).getHeight())
    const blank = await PDFDocument.load(await blankPdf(300, 400))
    expect(blank.getPage(0).getSize()).toEqual({ width: 300, height: 400 })
  })

  it('rejects an empty document', async () => {
    await expect(buildPdf({}, [])).rejects.toThrow('no pages')
  })
})
