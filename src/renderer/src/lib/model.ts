export type Rotation = 0 | 90 | 180 | 270

/** One page of a document, pointing at a page of a loaded source PDF. */
export interface PageRef {
  id: string
  sourceId: string
  /** Zero-based index of the page inside its source PDF. */
  sourceIndex: number
  /** Rotation applied on top of the page's own /Rotate. */
  rotation: Rotation
}

/** The editable state of a document. Every edit produces a new DocState. */
export interface DocState {
  pages: PageRef[]
}

export interface Size {
  width: number
  height: number
}

let counter = 0
export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export const rotate = (rotation: Rotation, delta: number): Rotation =>
  ((((rotation + delta) % 360) + 360) % 360) as Rotation
