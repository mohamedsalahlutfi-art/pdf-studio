import type { Annotation, Point, Rect, Size } from './model'

// Pure geometry: also bundled into the PDF worker, so it must not import pdf.js.

/** A page's unrotated size and its total display rotation. */
export interface Frame {
  width: number
  height: number
  rotation: number
}

/** Unrotated page point → display point (scale 1). */
export function toDisplay({ x, y }: Point, { width: W, height: H, rotation }: Frame): Point {
  switch (rotation) {
    case 90:
      return { x: H - y, y: x }
    case 180:
      return { x: W - x, y: H - y }
    case 270:
      return { x: y, y: W - x }
    default:
      return { x, y }
  }
}

/** Display point (scale 1) → unrotated page point. */
export function fromDisplay({ x, y }: Point, { width: W, height: H, rotation }: Frame): Point {
  switch (rotation) {
    case 90:
      return { x: y, y: H - x }
    case 180:
      return { x: W - x, y: H - y }
    case 270:
      return { x: W - y, y: x }
    default:
      return { x, y }
  }
}

/** Display vector → unrotated vector (no translation). */
export function vectorFromDisplay({ x, y }: Point, rotation: number): Point {
  switch (rotation) {
    case 90:
      return { x: y, y: -x }
    case 180:
      return { x: -x, y: -y }
    case 270:
      return { x: -y, y: x }
    default:
      return { x, y }
  }
}

/** SVG transform mapping unrotated page space onto the rotated display. */
export function displayMatrix({ width: W, height: H, rotation }: Frame): string {
  switch (rotation) {
    case 90:
      return `matrix(0 1 -1 0 ${H} 0)`
    case 180:
      return `matrix(-1 0 0 -1 ${W} ${H})`
    case 270:
      return `matrix(0 -1 1 0 0 ${W})`
    default:
      return ''
  }
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

function boundsOfPoints(points: Point[]): Rect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return rectFromPoints({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) })
}

export const NOTE_SIZE = 22

export function annotationBounds(a: Annotation): Rect {
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return boundsOfPoints(a.rects.flatMap((r) => [r, { x: r.x + r.width, y: r.y + r.height }]))
    case 'rect':
    case 'ellipse':
    case 'image':
      return a.rect
    case 'line':
    case 'arrow':
      return boundsOfPoints([a.from, a.to])
    case 'ink':
      return boundsOfPoints(a.paths.flat())
    case 'note':
      return { x: a.at.x, y: a.at.y, width: NOTE_SIZE, height: NOTE_SIZE }
  }
}

const move = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy })
const moveRect = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy })

export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return { ...a, rects: a.rects.map((r) => moveRect(r, dx, dy)) }
    case 'rect':
    case 'ellipse':
    case 'image':
      return { ...a, rect: moveRect(a.rect, dx, dy) }
    case 'line':
    case 'arrow':
      return { ...a, from: move(a.from, dx, dy), to: move(a.to, dx, dy) }
    case 'ink':
      return { ...a, paths: a.paths.map((path) => path.map((p) => move(p, dx, dy))) }
    case 'note':
      return { ...a, at: move(a.at, dx, dy) }
  }
}

export const isResizable = (a: Annotation): a is Extract<Annotation, { rect: Rect }> =>
  a.type === 'rect' || a.type === 'ellipse' || a.type === 'image'

/** Upright size of an image annotation (its own width/height before page rotation). */
export function uprightSize(a: { rect: Rect; angle: number }): Size {
  return a.angle % 180 === 0 ? { width: a.rect.width, height: a.rect.height } : { width: a.rect.height, height: a.rect.width }
}

/** Box (unrotated space) for an upright size placed with its centre at `center`, for the given display rotation. */
export function boxAround(center: Point, upright: Size, angle: number): Rect {
  const width = angle % 180 === 0 ? upright.width : upright.height
  const height = angle % 180 === 0 ? upright.height : upright.width
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

export function inkPathData(points: Point[]): string {
  if (!points.length) return ''
  const [first, ...rest] = points
  if (!rest.length) return `M${first.x} ${first.y}l0.01 0`
  return `M${first.x} ${first.y}` + rest.map((p) => `L${p.x} ${p.y}`).join('')
}

/** Arrowhead wing points for a line ending at `to`. */
export function arrowHead(from: Point, to: Point, width: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const length = Math.max(10, width * 4)
  const spread = Math.PI / 7
  return [
    { x: to.x - length * Math.cos(angle - spread), y: to.y - length * Math.sin(angle - spread) },
    { x: to.x - length * Math.cos(angle + spread), y: to.y - length * Math.sin(angle + spread) }
  ]
}
