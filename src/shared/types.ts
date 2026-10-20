export interface OpenedFile {
  name: string
  /** Absolute path on disk, or null when the file did not come from the filesystem. */
  path: string | null
  data: Uint8Array
}

export type Language = 'ar' | 'en'

export type MenuCommand =
  | 'open'
  | 'save'
  | 'save-as'
  | 'close-tab'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'fit-width'
  | 'fit-page'
  | 'toggle-sidebar'
  | 'toggle-theme'
  | 'toggle-invert'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'delete-pages'
  | 'duplicate-pages'
  | 'extract-pages'
  | 'insert-file'
  | 'insert-blank'
  | 'split'
  | 'merge-all'
  | 'page-labels'
  | 'select-all'
  | 'export-compress'
