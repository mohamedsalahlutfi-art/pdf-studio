/** Drag-and-drop payload types used inside the app. */
export const PAGES_MIME = 'application/x-salah-pages'
export const TAB_MIME = 'application/x-salah-tab'

export const hasType = (e: React.DragEvent, type: string): boolean => e.dataTransfer.types.includes(type)
export const hasFiles = (e: React.DragEvent): boolean => hasType(e, 'Files')
