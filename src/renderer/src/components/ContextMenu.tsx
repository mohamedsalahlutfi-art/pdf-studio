import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../store/useApp'

/** Right-click menu rendered at the cursor and kept inside the window. */
export function ContextMenu(): React.JSX.Element | null {
  const menu = useApp((s) => s.contextMenu)
  const close = useApp((s) => s.closeContextMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPosition({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - height - 4))
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const onPointer = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu, close])

  if (!menu) return null
  return (
    <div ref={ref} className="context-menu" role="menu" style={position} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((item, i) => {
        if (item.divider) return <div key={i} className="menu-divider" />
        if (item.heading) return <div key={i} className="menu-heading">{item.label}</div>
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              close()
              item.onClick?.()
            }}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut" dir="ltr">{item.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}
