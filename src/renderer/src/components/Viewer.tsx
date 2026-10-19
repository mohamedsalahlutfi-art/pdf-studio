import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { computeLayout, displaySize, pageAt, PAGE_GAP, visibleRange } from '../lib/layout'
import { useApp, type Tab } from '../store/useApp'
import { PageCanvas } from './PageCanvas'

const SIDE_PADDING = 48

/**
 * Virtualised page list: only pages near the viewport are mounted, so a
 * 1,000-page document costs about as much as a 10-page one.
 */
export function Viewer({ tab }: { tab: Tab }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, width: 0, height: 0 })
  const layoutVersion = useApp((s) => s.layoutVersion)
  const invertPages = useApp((s) => s.invertPages)
  const { reportScale, setCurrentPage, zoomBy } = useApp.getState()

  const pages = tab.history.present.pages
  const baseSizes = useMemo(() => pages.map(displaySize), [pages, layoutVersion])
  const maxWidth = useMemo(() => Math.max(1, ...baseSizes.map((s) => s.width)), [baseSizes])
  const scale = tab.fitWidth && viewport.width ? Math.max(0.1, (viewport.width - SIDE_PADDING) / maxWidth) : tab.zoom
  const layout = useMemo(() => computeLayout(baseSizes, scale), [baseSizes, scale])
  const [first, last] = visibleRange(layout, viewport.top, viewport.height, 2)

  // Keep the stored zoom in sync with fit-width so zoom in/out starts from what is on screen.
  useEffect(() => {
    if (tab.fitWidth && Math.abs(tab.zoom - scale) > 0.001) reportScale(tab.id, scale)
  }, [tab.fitWidth, tab.zoom, tab.id, scale, reportScale])

  useLayoutEffect(() => {
    const el = scroller.current!
    const measure = (): void => setViewport({ top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the same point of the same page under the viewport when the scale changes.
  const anchor = useRef<{ scale: number; page: number; offset: number } | null>(null)
  useLayoutEffect(() => {
    const el = scroller.current!
    const previous = anchor.current
    if (previous && previous.scale !== scale && layout.tops[previous.page] !== undefined) {
      const ratio = scale / previous.scale
      const centerX = el.scrollLeft + el.clientWidth / 2
      el.scrollTop = layout.tops[previous.page] + previous.offset * ratio
      el.scrollLeft = centerX * ratio - el.clientWidth / 2
    }
    const page = pageAt(layout, el.scrollTop)
    anchor.current = { scale, page, offset: el.scrollTop - (layout.tops[page] ?? 0) }
  }, [scale, layout])

  // Restore the scroll position when switching back to this tab.
  useLayoutEffect(() => {
    const el = scroller.current!
    el.scrollTop = Math.max(0, (layout.tops[tab.currentPage] ?? 0) - PAGE_GAP)
    }, [tab.id])

  useEffect(() => {
    if (!tab.scrollTarget) return
    scroller.current!.scrollTop = Math.max(0, (layout.tops[tab.scrollTarget.page] ?? 0) - PAGE_GAP)
    }, [tab.scrollTarget])

  // Ctrl/Cmd + wheel zooms; needs a non-passive listener to stop the browser zooming.
  useEffect(() => {
    const el = scroller.current!
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  const frame = useRef(0)
  const onScroll = (): void => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = scroller.current
      if (!el) return
      setViewport((v) => ({ ...v, top: el.scrollTop }))
      const topPage = pageAt(layout, el.scrollTop)
      anchor.current = { scale, page: topPage, offset: el.scrollTop - layout.tops[topPage] }
      const current = pageAt(layout, el.scrollTop + el.clientHeight / 3)
      if (current !== tab.currentPage) setCurrentPage(tab.id, current)
    })
  }

  const contentWidth = Math.max(viewport.width, Math.floor(maxWidth * scale) + SIDE_PADDING)
  const mounted = []
  for (let i = first; i <= last; i++) {
    const size = layout.sizes[i]
    mounted.push(
      <div
        key={pages[i].id}
        className="page"
        data-page={i + 1}
        style={{ top: layout.tops[i], width: size.width, height: size.height, left: (contentWidth - size.width) / 2 }}
      >
        <PageCanvas page={pages[i]} width={size.width} height={size.height} priority={0} delay={120} />
      </div>
    )
  }

  return (
    <div ref={scroller} className={`viewer${invertPages ? ' invert-pages' : ''}`} onScroll={onScroll} dir="ltr">
      <div className="viewer-content" style={{ height: layout.total, width: contentWidth }}>
        {mounted}
      </div>
    </div>
  )
}
