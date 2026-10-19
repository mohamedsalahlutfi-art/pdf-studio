// Copies the pdf.js runtime assets (CMaps, standard fonts, ICC profiles, WASM
// decoders) into the renderer's public folder so they ship with the app.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'public', 'pdfjs')

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'iccs', 'wasm']) {
  cpSync(join(pdfjsRoot, dir), join(target, dir), { recursive: true })
}
console.log(`pdf.js assets copied to ${target}`)
