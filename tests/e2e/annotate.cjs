// End-to-end test of comments, drawing, stamps and signatures: creates each
// kind with the mouse, saves, checks the PDF, and re-opens it to look at it.
// Run with `npm run build && npm run test:e2e` (Linux: wrap in xvfb-run -a).
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts, PDFName, PDFArray, PDFDict } = require('pdf-lib')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const step = (name) => console.log(`  ✓ ${name}`)

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salah-pdf-annotate-'))
  const downloads = path.join(dir, 'downloads')
  fs.mkdirSync(downloads)
  const input = path.join(dir, 'letter.pdf')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 2; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Quarterly report page ${i}`, { x: 60, y: 760, size: 28, font })
    for (let l = 0; l < 12; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog`, { x: 60, y: 700 - l * 22, size: 14, font })
  }
  fs.writeFileSync(input, await doc.save())
  const screenshots = process.env.E2E_SCREENSHOTS

  const app = await electron.launch({ args: ['--no-sandbox', `--user-data-dir=${path.join(dir, 'profile')}`, '.', input] })
  const errors = []
  try {
    await app.evaluate(({ app }, d) => app.setPath('downloads', d), downloads)
    const win = await app.firstWindow()
    win.on('pageerror', (e) => errors.push(String(e)))
    win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    const command = (name) =>
      app.evaluate(({ BrowserWindow }, cmd) => BrowserWindow.getAllWindows()[0].webContents.send('menu', cmd), name)
    const annotations = () =>
      win.evaluate(() => {
        const s = window.__salahStore.getState()
        const tab = s.tabs.find((t) => t.id === s.activeId)
        return tab.history.present.pages[0].annotations?.map((a) => (a.type === 'image' ? `image:${a.kind}` : a.type)) ?? []
      })
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 80; i++) {
        const value = await annotations()
        if (predicate(value)) return value
        await win.waitForTimeout(100)
      }
      throw new Error(`Timed out: ${label} (${JSON.stringify(await annotations())}) errors: ${errors.join(" | ")}`)
    }
    const tool = (label) => win.locator('.ribbon-tool', { hasText: new RegExp(`^${label}$`) }).click()

    await win.waitForSelector('.page[data-page="1"] canvas', { timeout: 20000 })
    await win.waitForSelector('.page[data-page="1"] .textLayer span')
    await win.locator('.ribbon-tabs button').nth(1).click()
    // Show the whole first page so every point we click is on screen.
    await win.evaluate(() => window.__salahStore.getState().setZoom(0.75))
    await win.waitForTimeout(500)
    const page = win.locator('.page[data-page="1"]')
    const box = await page.boundingBox()
    const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })
    const drag = async (from, to, steps = 8) => {
      await win.mouse.move(from.x, from.y)
      await win.mouse.down()
      await win.mouse.move(to.x, to.y, { steps })
      await win.mouse.up()
    }

    // Highlight by selecting text in the text layer.
    await tool('تظليل')
    const title = await page.locator('.textLayer span', { hasText: 'Quarterly report page 1' }).boundingBox()
    await drag({ x: title.x + 2, y: title.y + title.height / 2 }, { x: title.x + title.width - 2, y: title.y + title.height / 2 })
    await waitFor((a) => a.includes('highlight'), 'highlight')
    step('highlight selected text')

    await tool('مربع')
    await drag(at(0.1, 0.3), at(0.45, 0.42))
    await tool('سهم')
    await drag(at(0.6, 0.3), at(0.8, 0.4))
    await tool('قلم')
    await drag(at(0.15, 0.5), at(0.4, 0.55), 15)
    await waitFor((a) => ['rect', 'arrow', 'ink'].every((k) => a.includes(k)), 'shapes')
    step('box, arrow and pen drawing')

    await tool('نص')
    await page.click({ position: { x: box.width * 0.1, y: box.height * 0.65 } })
    await win.keyboard.type('مرحبا بالعالم — Hello world')
    await win.locator('.ribbon-tabs button').nth(1).click()
    await waitFor((a) => a.includes('image:text'), 'text box')
    step('Arabic + English text box')

    await tool('ملاحظة')
    await page.click({ position: { x: box.width * 0.9, y: box.height * 0.1 } })
    await win.locator('.note-editor textarea').fill('راجع هذا الرقم')
    await win.locator('.ribbon-tabs button').nth(1).click()
    await waitFor((a) => a.includes('note'), 'note')
    step('sticky note')

    await win.locator('.ribbon-tool', { hasText: 'أختام' }).click()
    if (screenshots) await win.screenshot({ path: path.join(screenshots, 'stamps-menu.png') })
    await win.locator('.stamp-option').first().click()
    await page.click({ position: { x: box.width * 0.7, y: box.height * 0.8 } })
    await waitFor((a) => a.includes('image:stamp'), 'stamp')
    // Move the selected stamp, then resize it from its handle.
    const stampBefore = await win.evaluate(() => {
      const s = window.__salahStore.getState()
      const tab = s.tabs.find((t) => t.id === s.activeId)
      return tab.history.present.pages[0].annotations.find((a) => a.kind === 'stamp').rect
    })
    await drag(at(0.7, 0.8), at(0.65, 0.75))
    const handle = await win.locator('.resize-handle').boundingBox()
    await drag({ x: handle.x + 5, y: handle.y + 5 }, { x: handle.x + 60, y: handle.y + 60 })
    const stampAfter = await win.evaluate(() => {
      const s = window.__salahStore.getState()
      const tab = s.tabs.find((t) => t.id === s.activeId)
      return tab.history.present.pages[0].annotations.find((a) => a.kind === 'stamp').rect
    })
    assert.ok(stampAfter.x < stampBefore.x - 10, 'stamp moved left')
    assert.ok(stampAfter.width > stampBefore.width + 10, 'stamp resized')
    step('stamp placed, moved and resized')

    await win.locator('.ribbon-tool', { hasText: 'توقيع' }).click()
    await win.locator('.signature-menu button.primary').click()
    const padBox = await win.locator('.signature-pad').boundingBox()
    await drag({ x: padBox.x + 60, y: padBox.y + 120 }, { x: padBox.x + 260, y: padBox.y + 80 }, 20)
    await drag({ x: padBox.x + 100, y: padBox.y + 60 }, { x: padBox.x + 200, y: padBox.y + 150 }, 20)
    await win.locator('.modal button.primary').click()
    await page.click({ position: { x: box.width * 0.3, y: box.height * 0.88 } })
    await waitFor((a) => a.includes('image:signature'), 'signature')
    const library = await win.evaluate(() => window.__salahStore.getState().library.signatures.length)
    assert.equal(library, 1)
    step('drawn signature saved to library and placed')

    // Eraser, undo.
    const count = (await annotations()).length
    await tool('ممحاة')
    await page.locator('.ann').first().click({ force: true })
    await waitFor((a) => a.length === count - 1, 'erased')
    await command('undo')
    await waitFor((a) => a.length === count, 'undo erase')
    step('eraser and undo')

    if (screenshots) {
      await tool('تحديد')
      await win.screenshot({ path: path.join(screenshots, 'annotations.png') })
    }

    // Rotate the page: annotations stay attached to the content.
    await win.locator('.ribbon-tabs button').nth(0).click()
    await win.locator('.thumb').first().click()
    await command('rotate-cw')
    await win.waitForTimeout(800)
    if (screenshots) await win.screenshot({ path: path.join(screenshots, 'annotations-rotated.png') })

    await command('save')
    const out = path.join(downloads, 'letter.pdf')
    for (let i = 0; i < 50 && !fs.existsSync(out); i++) await win.waitForTimeout(100)
    await win.waitForTimeout(300)
    const saved = await PDFDocument.load(fs.readFileSync(out))
    const annots = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    const note = annots.lookup(0, PDFDict)
    assert.equal(note.get(PDFName.of('Subtype')).toString(), '/Text')
    assert.equal(saved.getPage(0).getRotation().angle, 90)
    assert.ok(saved.getPage(0).node.Contents().size() >= 3, 'annotation drawing appended to page content')
    step('saved: drawings flattened into the page, note kept as a PDF comment')

    // Re-open the saved file to look at how it renders.
    await win.evaluate(
      ([file, b64]) => {
        const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        return window.__salahStore.getState().openFiles([{ name: 'reopened.pdf', path: null, data }])
      },
      [out, fs.readFileSync(out).toString('base64')]
    )
    await win.waitForTimeout(1500)
    if (screenshots) await win.screenshot({ path: path.join(screenshots, 'reopened.png') })
    assert.deepEqual(errors, [])
    console.log('annotation e2e test passed')
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {})
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
