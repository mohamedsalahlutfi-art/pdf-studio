import { TextLayer as PdfTextLayer } from 'pdfjs-dist'
import { useEffect, useRef } from 'react'
import type { PageRef } from '../lib/model'
import { getSource } from '../lib/sources'

/**
 * Invisible, selectable text over the page canvas (pdf.js text layer). It is
 * laid out once at scale 1 and follows zoom through a CSS variable.
 */
export function TextLayer({ page, scale }: { page: PageRef; scale: number }): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const source = getSource(page.sourceId)
    const el = container.current
    if (!source || !el) return
    let layer: PdfTextLayer | null = null
    let cancelled = false
    const timer = setTimeout(async () => {
      const pdfPage = await source.pdf.getPage(page.sourceIndex + 1)
      if (cancelled) return
      el.replaceChildren()
      layer = new PdfTextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: el,
        viewport: pdfPage.getViewport({ scale: 1, rotation: (pdfPage.rotate + page.rotation) % 360 })
      })
      await layer.render().catch(() => {})
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
      layer?.cancel()
    }
  }, [page.sourceId, page.sourceIndex, page.rotation])

  return <div ref={container} className="textLayer" style={{ ['--total-scale-factor' as string]: scale }} />
}
