import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hasFiles, hasType, PAGES_MIME, TAB_MIME } from '../lib/dnd'
import { displaySize, pageAt, visibleRange, type Layout } from '../lib/layout'
import { pageLabel } from '../lib/pageLabels'
import * as platform from '../lib/platform'
import { useApp, type Tab } from '../store/useApp'
import { pageMenuItems } from './menus'
import { PageCanvas } from './PageCanvas'

const THUMB_WIDTH = 120
const LABEL_HEIGHT = 22
const GAP = 14
const EDGE = 48

/**
 * Virtualised thumbnail strip. Supports multi-select (Ctrl/Shift click),
 * drag to reorder, dropping files or tabs to insert/merge at a position, and a
 * right-click page menu.
 */
export function Thumbnails({ tab }: { tab: Tab }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 0 })
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const layoutVersion = useApp((s) => s.layoutVersion)
  const invertPages = useApp((s) => s.invertPages)
  const pages = tab.history.present.pages
  const labels = tab.history.present.labels
  const selection = useMemo(() => new Set(tab.selection), [tab.selection])

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
    // layoutVersion: page sizes are measured in the background after opening.
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

  const indexAtPointer = (e: React.DragEvent): number => {
    const el = scroller.current!
    const y = e.clientY - el.getBoundingClientRect().top + el.scrollTop
    if (!pages.length) return 0
    const i = pageAt(layout, y)
    return y > layout.tops[i] + layout.sizes[i].height / 2 ? i + 1 : i
  }

  const onDragOver = (e: React.DragEvent): void => {
    if (!hasType(e, PAGES_MIME) && !hasType(e, TAB_MIME) && !hasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = hasType(e, PAGES_MIME) ? 'move' : 'copy'
    setDropIndex(indexAtPointer(e))
    const el = scroller.current!
    const rect = el.getBoundingClientRect()
    if (e.clientY < rect.top + EDGE) el.scrollTop -= 12
    else if (e.clientY > rect.bottom - EDGE) el.scrollTop += 12
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const index = dropIndex ?? pages.length
    setDropIndex(null)
    const s = useApp.getState()
    const pageIds = e.dataTransfer.getData(PAGES_MIME)
    const tabId = e.dataTransfer.getData(TAB_MIME)
    if (pageIds) s.movePages(JSON.parse(pageIds) as string[], index)
    else if (tabId) s.mergeTabInto(tabId, tab.id, index)
    else if (e.dataTransfer.files.length) {
      void platform.openDropped([...e.dataTransfer.files]).then((files) => s.insertFiles(files, index, tab.id))
    }
  }

  const [first, last] = visibleRange(layout, view.top, view.height, 4)
  const items = []
  for (let i = first; i <= last; i++) {
    const page = pages[i]
    const size = layout.sizes[i]
    const label = pageLabel(i, labels)
    const classes = ['thumb', i === tab.currentPage && 'current', selection.has(page.id) && 'selected'].filter(Boolean)
    items.push(
      <div
        key={page.id}
        role="option"
        aria-selected={selection.has(page.id)}
        className={classes.join(' ')}
        style={{ top: layout.tops[i] }}
        draggable
        onClick={(e) => {
          const s = useApp.getState()
          s.selectPage(page.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single')
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey) s.goToPage(i)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          const s = useApp.getState()
          s.selectPage(page.id, 'keep')
          s.setCurrentPage(tab.id, i)
          s.openContextMenu(e.clientX, e.clientY, pageMenuItems(i))
        }}
        onDragStart={(e) => {
          const s = useApp.getState()
          if (!selection.has(page.id)) s.selectPage(page.id, 'single')
          const ids = selection.has(page.id) ? tab.selection : [page.id]
          e.dataTransfer.setData(PAGES_MIME, JSON.stringify(ids))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDropIndex(null)}
      >
        <div className="thumb-page" style={{ width: size.width, height: size.height }}>
          <PageCanvas page={page} width={size.width} height={size.height} priority={1} />
        </div>
        <span className="thumb-label">{label === String(i + 1) ? label : `${label} (${i + 1})`}</span>
      </div>
    )
  }

  const indicatorTop =
    dropIndex === null ? null : dropIndex < pages.length ? layout.tops[dropIndex] - GAP / 2 : layout.total - GAP / 2

  return (
    <aside
      ref={scroller}
      className={`thumbnails${invertPages ? ' invert-pages' : ''}`}
      role="listbox"
      aria-multiselectable
      onScroll={(e) => setView((v) => ({ ...v, top: e.currentTarget.scrollTop }))}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null)
      }}
      onDrop={onDrop}
    >
      <div style={{ height: layout.total, position: 'relative' }}>
        {items}
        {indicatorTop !== null && <div className="drop-indicator" style={{ top: indicatorTop }} />}
      </div>
    </aside>
  )
}
