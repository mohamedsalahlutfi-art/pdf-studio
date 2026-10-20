export type Rotation = 0 | 90 | 180 | 270

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Annotation geometry is stored in the page's unrotated coordinate space:
 * PDF points, origin at the top-left of the visible page box, y down. That
 * keeps annotations attached to the content when the page is rotated later.
 */
interface AnnotationBase {
  id: string
  color: string
}

export interface MarkupAnnotation extends AnnotationBase {
  type: 'highlight' | 'underline' | 'strikeout'
  rects: Rect[]
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'rect' | 'ellipse'
  rect: Rect
  width: number
  fill: string | null
}

export interface LineAnnotation extends AnnotationBase {
  type: 'line' | 'arrow'
  from: Point
  to: Point
  width: number
}

export interface InkAnnotation extends AnnotationBase {
  type: 'ink'
  paths: Point[][]
  width: number
}

/** A sticky note; exported as a real PDF comment that other readers can open. */
export interface NoteAnnotation extends AnnotationBase {
  type: 'note'
  at: Point
  text: string
  author: string
  date: string
}

export interface TextSpec {
  value: string
  fontSize: number
}

/**
 * Stamps, signatures, pictures and text boxes. Text boxes are drawn to an
 * image (so Arabic shapes correctly everywhere) and keep `text` for editing.
 */
export interface ImageAnnotation extends AnnotationBase {
  type: 'image'
  kind: 'stamp' | 'signature' | 'image' | 'text'
  rect: Rect
  /** Page display rotation when placed; the image is drawn upright at that rotation. */
  angle: Rotation
  assetId: string
  text?: TextSpec
}

export type Annotation =
  | MarkupAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | InkAnnotation
  | NoteAnnotation
  | ImageAnnotation

/** One page of a document, pointing at a page of a loaded source PDF. */
export interface PageRef {
  id: string
  sourceId: string
  /** Zero-based index of the page inside its source PDF. */
  sourceIndex: number
  /** Rotation applied on top of the page's own /Rotate. */
  rotation: Rotation
  annotations?: Annotation[]
}

/** PDF page label styles: decimal, roman, letters, or prefix only. */
export type LabelStyle = 'D' | 'r' | 'R' | 'a' | 'A' | 'none'

/** A page-label range, as in the PDF /PageLabels number tree. */
export interface LabelRange {
  /** Zero-based index of the first page the range applies to. */
  startIndex: number
  style: LabelStyle
  prefix: string
  /** Number of the first page in the range (1 = "1", "i", "a"…). */
  start: number
}

/** The editable state of a document. Every edit produces a new DocState. */
export interface DocState {
  pages: PageRef[]
  /** Custom page numbering, or null to number pages 1…n. */
  labels: LabelRange[] | null
}

export interface Size {
  width: number
  height: number
}

let counter = 0
export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export const rotate = (rotation: Rotation, delta: number): Rotation =>
  ((((rotation + delta) % 360) + 360) % 360) as Rotation
