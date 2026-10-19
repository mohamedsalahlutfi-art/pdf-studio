// End-to-end smoke test: launches the built app on a generated 300-page PDF,
// navigates, rotates, undoes/redoes and saves, then checks the written file.
// Run with `npm run test:e2e` after `npm run build` (Linux CI: wrap in xvfb-run).
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function makePdf(file, pages) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(i % 50 === 0 ? [842, 595] : [595, 842])
    page.drawText(`Page ${i}`, { x: 60, y: page.getHeight() - 100, size: 36, font })
  }
  fs.writeFileSync(file, await doc.save())
}

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-studio-e2e-'))
  const input = path.join(dir, 'big.pdf')
  const output = path.join(dir, 'out.pdf')
  await makePdf(input, 300)

  const app = await electron.launch({
    args: ['--no-sandbox', `--user-data-dir=${path.join(dir, 'profile')}`, '.', input]
  })
  const errors = []
  try {
    const win = await app.firstWindow()
    win.on('pageerror', (e) => errors.push(String(e)))
    win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    const command = (name) =>
      app.evaluate(({ BrowserWindow }, cmd) => BrowserWindow.getAllWindows()[0].webContents.send('menu', cmd), name)

    await win.waitForSelector('.page canvas', { timeout: 20000 })
    assert.ok((await win.locator('.page').count()) < 10, 'viewer should virtualise pages')

    await win.fill('.page-input', '150')
    await win.press('.page-input', 'Enter')
    await win.waitForSelector('.page[data-page="150"] canvas')

    await command('rotate-cw')
    await win.waitForSelector('.dirty-dot')
    await command('undo')
    assert.equal(await win.locator('.dirty-dot').count(), 0)
    await command('redo')
    await win.waitForSelector('.dirty-dot')

    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, output)
    await command('save-as')
    await win.waitForSelector('.dirty-dot', { state: 'detached', timeout: 20000 })

    const saved = await PDFDocument.load(fs.readFileSync(output))
    assert.equal(saved.getPageCount(), 300)
    assert.equal(saved.getPage(149).getRotation().angle, 90)
    assert.equal(saved.getPage(0).getRotation().angle, 0)
    assert.deepEqual(errors, [])
    console.log('e2e smoke test passed')
  } finally {
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
