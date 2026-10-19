import { useEffect, useRef } from 'react'
import type { PageRef } from '../lib/model'
import type { RenderTask } from '../lib/pdfjs'
import { enqueueRender } from '../lib/renderQueue'
import { getSource } from '../lib/sources'

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
          const ratio = Math.min(window.devicePixelRatio || 1, 3)
          const viewport = pdfPage.getViewport({ scale: (width / base.width) * ratio, rotation })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          renderTask = pdfPage.render({ canvas, viewport })
          await renderTask.promise
          if (!disposed && holder.current) holder.current.replaceChildren(canvas)
        } catch (error) {
          if ((error as Error)?.name !== 'RenderingCancelledException') console.error(error)
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
