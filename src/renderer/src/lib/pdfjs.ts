import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Absolute URLs: the pdf.js worker resolves these from its own location.
const asset = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href

export type PasswordRequest = (reason: 'need' | 'incorrect') => Promise<string | null>

export class PasswordCancelledError extends Error {}

export function loadPdf(data: Uint8Array, requestPassword: PasswordRequest): Promise<pdfjs.PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    // pdf.js takes ownership of (and detaches) the buffer it receives.
    data: data.slice(),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    iccUrl: asset('iccs'),
    wasmUrl: asset('wasm')
  })
  task.onPassword = (update: (password: string) => void, reason: number) => {
    void requestPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'need').then(
      (password) => {
        if (password === null) void task.destroy()
        else update(password)
      }
    )
  }
  return task.promise.catch((error: unknown) => {
    if (task.destroyed) throw new PasswordCancelledError()
    throw error
  })
}

export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
