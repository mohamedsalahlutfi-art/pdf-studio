import { decryptBytes, inspectSecurity } from './exportDocument'
import type { Size } from './model'
import { newId } from './model'
import { PasswordCancelledError, loadPdf, type PasswordRequest, type PDFDocumentProxy } from './pdfjs'
import { WrongPasswordError, type Permissions } from './security'

/** A loaded PDF file that document pages can point at. Kept outside React state. */
export interface Source {
  id: string
  name: string
  bytes: Uint8Array
  pdf: PDFDocumentProxy
  pageCount: number
  /** Page sizes at scale 1 with the page's own /Rotate applied. */
  sizes: Size[]
  /** Each page's own /Rotate (0, 90, 180, 270). */
  rotations: number[]
  /** True once `sizes` holds measured values for every page. */
  measured: boolean
  /** The restrictions the file carried before it was unlocked, for display. null if it was not encrypted. */
  openedPermissions: Permissions | null
}

const sources = new Map<string, Source>()

export const getSource = (id: string): Source | undefined => sources.get(id)

/**
 * Loads a PDF. An encrypted file is unlocked ONCE here — prompting for the
 * password only when the file actually needs one — and the decrypted bytes are
 * kept, so rendering, editing, compression and saving all run on plaintext
 * exactly as for an unprotected file. We never claim to bypass encryption:
 * without the correct password the file does not open.
 *
 * Resolves as soon as the first page is measured so large files open quickly;
 * the remaining page sizes are filled in the background via `onMeasured`.
 */
export async function addSource(
  name: string,
  bytes: Uint8Array,
  requestPassword: PasswordRequest,
  onMeasured: () => void
): Promise<Source> {
  const info = await inspectSecurity(bytes)
  let openedPermissions: Permissions | null = null
  if (info.encrypted) {
    openedPermissions = info.permissions
    // Owner-only files open with an empty password; otherwise ask the user.
    let password = ''
    let reason: 'need' | 'incorrect' = 'need'
    for (;;) {
      if (!info.opensWithoutPassword || reason === 'incorrect') {
        const entered = await requestPassword(reason)
        if (entered === null) throw new PasswordCancelledError()
        password = entered
      }
      try {
        bytes = await decryptBytes(bytes, password)
        break
      } catch (error) {
        if (error instanceof WrongPasswordError) {
          reason = 'incorrect'
          continue
        }
        throw error
      }
    }
  }

  const pdf = await loadPdf(bytes, requestPassword)
  const firstPage = await pdf.getPage(1)
  const first = firstPage.getViewport({ scale: 1 })
  const source: Source = {
    id: newId('src'),
    name,
    bytes,
    pdf,
    pageCount: pdf.numPages,
    sizes: Array.from({ length: pdf.numPages }, () => ({ width: first.width, height: first.height })),
    rotations: Array.from({ length: pdf.numPages }, () => firstPage.rotate),
    measured: pdf.numPages === 1,
    openedPermissions
  }
  sources.set(source.id, source)
  if (!source.measured) void measurePages(source, onMeasured)
  return source
}

async function measurePages(source: Source, onMeasured: () => void): Promise<void> {
  const BATCH = 50
  for (let start = 2; start <= source.pageCount; start += BATCH) {
    if (!sources.has(source.id)) return
    const end = Math.min(source.pageCount, start + BATCH - 1)
    const pages = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) => source.pdf.getPage(start + i))
    )
    let changed = false
    for (const page of pages) {
      const { width, height } = page.getViewport({ scale: 1 })
      const index = page.pageNumber - 1
      const size = source.sizes[index]
      if (size.width !== width || size.height !== height || source.rotations[index] !== page.rotate) {
        source.sizes[index] = { width, height }
        source.rotations[index] = page.rotate
        changed = true
      }
    }
    if (changed) onMeasured()
  }
  source.measured = true
}

export function releaseSource(id: string): void {
  const source = sources.get(id)
  if (!source) return
  sources.delete(id)
  void source.pdf.loadingTask.destroy()
}
