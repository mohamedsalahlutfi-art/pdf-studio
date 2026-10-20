import { useEffect, useRef } from 'react'
import type { PageRef } from '../lib/model'
import type { RenderTask } from '../lib/pdfjs'
import { enqueueRender } from '../lib/renderQueue'
import { getSource } from '../lib/sources'

// Hard limits on a rendered page canvas. Browsers cap a canvas at ~16384px per
// side and crash the GPU process well before that on memory, so a big drawing
// at high zoom is clamped to stay safe. These bound each page bitmap, not zoom.
const MAX_DIMENSION = 8192
const MAX_PIXELS = 24_000_000

interface Props {
  page: PageRef
  width: number
  height: number
  /** Render queue priority; lower renders first. */
  priority: number
  /** Delay before rendering, so rapid zooming only renders the final size. */
  delay?: number
}

/**
 * Draws one page. The new bitmap is rendered off-screen and swapped in when
 * complete, so while zooming the previous bitmap stays visible (stretched)
 * instead of flashing blank.
 */
export function PageCanvas({ page, width, height, priority, delay = 0 }: Props): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const source = getSource(page.sourceId)
    if (!source || width <= 0) return
    let renderTask: RenderTask | null = null
    let cancelJob: (() => void) | null = null
    let disposed = false
    // Only debounce re-renders; a page's first render starts immediately.
    const wait = holder.current?.firstChild ? delay : 0

    const timer = setTimeout(() => {
      cancelJob = enqueueRender(priority, async () => {
        if (disposed) return
        try {
          const pdfPage = await source.pdf.getPage(page.sourceIndex + 1)
          if (disposed) return
          const rotation = (pdfPage.rotate + page.rotation) % 360
          const base = pdfPage.getViewport({ scale: 1, rotation })
          // Cap the canvas so large pages (A0/A1 drawings at high zoom) never
          // exceed the browser's canvas limits or exhaust GPU memory, which
          // crashed the renderer to a blank window. Keep within a max dimension
          // and a max total pixel budget, lowering the pixel ratio as needed.
          const ratio = Math.min(window.devicePixelRatio || 1, 2)
          let renderScale = (width / base.width) * ratio
          const limit = Math.min(
            MAX_DIMENSION / (base.width * renderScale || 1),
            MAX_DIMENSION / (base.height * renderScale || 1),
            Math.sqrt(MAX_PIXELS / Math.max(1, base.width * base.height * renderScale * renderScale))
          )
          if (limit < 1) renderScale *= limit
          const viewport = pdfPage.getViewport({ scale: renderScale, rotation })
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.floor(viewport.width))
          canvas.height = Math.max(1, Math.floor(viewport.height))
          const context = canvas.getContext('2d', { alpha: false })
          if (!context) throw new Error('2d context unavailable')
          renderTask = pdfPage.render({ canvas, canvasContext: context, viewport })
          await renderTask.promise
          if (!disposed && holder.current) holder.current.replaceChildren(canvas)
        } catch (error) {
          if ((error as Error)?.name !== 'RenderingCancelledException') console.error('page render failed', error)
        }
      })
    }, wait)

    return () => {
      disposed = true
      clearTimeout(timer)
      cancelJob?.()
      renderTask?.cancel()
    }
  }, [page.sourceId, page.sourceIndex, page.rotation, width, height, priority, delay])

  return <div ref={holder} className="page-canvas" />
}
