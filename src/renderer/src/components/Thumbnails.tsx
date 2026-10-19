import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { displaySize, visibleRange, type Layout } from '../lib/layout'
import { useApp, type Tab } from '../store/useApp'
import { PageCanvas } from './PageCanvas'

const THUMB_WIDTH = 120
const LABEL_HEIGHT = 22
const GAP = 14

export function Thumbnails({ tab }: { tab: Tab }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 0 })
  const layoutVersion = useApp((s) => s.layoutVersion)
  const invertPages = useApp((s) => s.invertPages)
  const goToPage = useApp((s) => s.goToPage)
  const pages = tab.history.present.pages

  const layout = useMemo<Layout>(() => {
    const tops: number[] = []
    const sizes = pages.map((p) => {
      const base = displaySize(p)
      return { width: THUMB_WIDTH, height: Math.round((base.height / base.width) * THUMB_WIDTH) }
    })
    let y = GAP
    for (const s of sizes) {
      tops.push(y)
      y += s.height + LABEL_HEIGHT + GAP
    }
    return { tops, sizes, total: y }
  }, [pages, layoutVersion])

  useLayoutEffect(() => {
    const el = scroller.current!
    const measure = (): void => setView({ top: el.scrollTop, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the current page's thumbnail in view as the reader scrolls.
  useEffect(() => {
    const el = scroller.current!
    const top = layout.tops[tab.currentPage]
    if (top === undefined) return
    const bottom = top + layout.sizes[tab.currentPage].height + LABEL_HEIGHT
    if (top < el.scrollTop) el.scrollTop = top - GAP
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight + GAP
  }, [tab.currentPage, layout])

  const [first, last] = visibleRange(layout, view.top, view.height, 4)
  const items = []
  for (let i = first; i <= last; i++) {
    const size = layout.sizes[i]
    items.push(
      <button
        key={pages[i].id}
        type="button"
        className={`thumb${i === tab.currentPage ? ' active' : ''}`}
        style={{ top: layout.tops[i] }}
        onClick={() => goToPage(i)}
      >
        <div className="thumb-page" style={{ width: size.width, height: size.height }}>
          <PageCanvas page={pages[i]} width={size.width} height={size.height} priority={1} />
        </div>
        <span className="thumb-label">{i + 1}</span>
      </button>
    )
  }

  return (
    <aside
      ref={scroller}
      className={`thumbnails${invertPages ? ' invert-pages' : ''}`}
      onScroll={(e) => setView((v) => ({ ...v, top: e.currentTarget.scrollTop }))}
    >
      <div style={{ height: layout.total, position: 'relative' }}>{items}</div>
    </aside>
  )
}
