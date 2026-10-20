// End-to-end test of the built app: opening, tabs, thumbnails, page tools,
// context menus, drag-and-drop reorder and merge, auto-save to Downloads,
// split and page numbering. Run with `npm run build && npm run test:e2e`
// (Linux without a display: `xvfb-run -a npm run test:e2e`).
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PNG_2x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DAwMDAwAAAEPkB/80MYYgAAAAASUVORK5CYII='

async function makePdf(file, pages) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(i % 50 === 0 ? [842, 595] : [595, 842])
    page.drawText(`${path.basename(file)} page ${i}`, { x: 60, y: page.getHeight() - 100, size: 30, font })
  }
  fs.writeFileSync(file, await doc.save())
}

const step = (name) => console.log(`  ✓ ${name}`)

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salah-pdf-e2e-'))
  const downloads = path.join(dir, 'downloads')
  fs.mkdirSync(downloads)
  const big = path.join(dir, 'big.pdf')
  const small = path.join(dir, 'small.pdf')
  const image = path.join(dir, 'photo.png')
  await makePdf(big, 300)
  await makePdf(small, 3)
  fs.writeFileSync(image, Buffer.from(PNG_2x1, 'base64'))
  const screenshots = process.env.E2E_SCREENSHOTS

  const app = await electron.launch({
    args: ['--no-sandbox', `--user-data-dir=${path.join(dir, 'profile')}`, '.', big, small]
  })
  const errors = []
  try {
    await app.evaluate(({ app }, dir) => app.setPath('downloads', dir), downloads)
    const win = await app.firstWindow()
    win.on('pageerror', (e) => errors.push(String(e)))
    win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    const command = (name) =>
      app.evaluate(({ BrowserWindow }, cmd) => BrowserWindow.getAllWindows()[0].webContents.send('menu', cmd), name)
    const state = () =>
      win.evaluate(() => {
        const s = window.__salahStore.getState()
        const tab = s.tabs.find((t) => t.id === s.activeId)
        return {
          tabs: s.tabs.map((t) => t.title),
          active: tab?.title,
          pages: tab?.history.present.pages.map((p) => `${p.sourceIndex}@${p.rotation}`) ?? [],
          selection: tab?.selection.length ?? 0,
          dirty: tab ? tab.history.present !== tab.savedState : false,
          outputPath: tab?.outputPath ?? null
        }
      })
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 100; i++) {
        if (predicate(await state())) return
        await win.waitForTimeout(100)
      }
      throw new Error(`Timed out waiting for: ${label} (state: ${JSON.stringify(await state())})`)
    }
    const thumb = (n) => win.locator('.thumb').filter({ has: win.locator('.thumb-label', { hasText: new RegExp(`^${n}$`) }) })

    await win.waitForSelector('.page canvas', { timeout: 20000 })
    await waitFor((s) => s.tabs.length === 2, 'two tabs open')
    step('opens two PDFs from the command line')

    // Switching tabs must leave exactly one thumbnail strip, and the sidebar must hide.
    await win.locator('.tab').nth(0).click()
    await win.locator('.tab').nth(1).click()
    await win.locator('.tab').nth(0).click()
    assert.equal(await win.locator('.thumbnails').count(), 1)
    await command('toggle-sidebar')
    assert.equal(await win.locator('.thumbnails').count(), 0)
    await command('toggle-sidebar')
    assert.equal(await win.locator('.thumbnails').count(), 1)
    step('one thumbnail strip per tab, sidebar toggles')

    // Multi-select with Ctrl and delete, then undo.
    await thumb(2).click()
    await thumb(3).click({ modifiers: ['Control'] })
    await waitFor((s) => s.selection === 2, 'two pages selected')
    await win.keyboard.press('Delete')
    await waitFor((s) => s.pages.length === 298 && s.dirty, 'pages deleted')
    await command('undo')
    await waitFor((s) => s.pages.length === 300, 'undo restores pages')
    step('ctrl-click selection, Delete key, undo')

    // Right-click menu on a thumbnail: duplicate.
    await thumb(1).click()
    await thumb(1).click({ button: 'right' })
    await win.waitForSelector('.context-menu')
    if (screenshots) await win.screenshot({ path: path.join(screenshots, 'context-menu.png') })
    await win.locator('.context-menu .menu-item', { hasText: 'تكرار' }).click()
    await waitFor((s) => s.pages.length === 301 && s.pages[1] === '0@0', 'page duplicated after itself')
    await command('undo')
    step('thumbnail context menu duplicates a page')

    // Drag page 1 below page 3 in the thumbnail strip.
    await thumb(1).dragTo(thumb(3), { targetPosition: { x: 60, y: 160 } })
    await waitFor((s) => s.pages.slice(0, 3).join() === '1@0,2@0,0@0', 'page 1 moved after page 3')
    await command('undo')
    step('drag to reorder pages')

    // Rotate selection, insert blank page, page numbering.
    await thumb(1).click()
    await command('rotate-cw')
    await waitFor((s) => s.pages[0] === '0@90', 'rotated')
    await command('insert-blank')
    await waitFor((s) => s.pages.length === 301, 'blank page inserted')
    await command('page-labels')
    await win.locator('.labels-table select').selectOption('r')
    await win.locator('.modal button.primary').click()
    await win.waitForSelector('.thumb-label:text("i")')
    step('rotate, insert blank page, roman page numbering')

    // Ctrl+S saves into Downloads without asking, then overwrites that same file.
    await command('save')
    await waitFor((s) => !s.dirty && s.outputPath, 'saved')
    const first = (await state()).outputPath
    assert.equal(first, path.join(downloads, 'big.pdf'))
    await command('rotate-cw')
    await command('save')
    await waitFor((s) => !s.dirty, 'saved again')
    assert.deepEqual(fs.readdirSync(downloads), ['big.pdf'])
    const saved = await PDFDocument.load(fs.readFileSync(first))
    assert.equal(saved.getPageCount(), 301)
    // The second rotation acted on the newly inserted (and selected) blank page.
    assert.deepEqual([0, 1].map((i) => saved.getPage(i).getRotation().angle), [90, 90])
    assert.match(saved.catalog.get(require('pdf-lib').PDFName.of('PageLabels')).toString(), /\/S \/r/)
    step('Ctrl+S saves to Downloads automatically and reuses the file')

    // Merge: drag the second tab onto the first.
    await win.locator('.tab').nth(1).dragTo(win.locator('.tab').nth(0))
    await waitFor((s) => s.tabs.length === 1 && s.pages.length === 304, 'tabs merged')
    step('drag a tab onto another tab merges the files')

    // Images open as a PDF; merge-all combines every tab.
    await app.evaluate(({ BrowserWindow }, file) => {
      const fs = require('node:fs')
      BrowserWindow.getAllWindows()[0].webContents.send('files:opened', [
        { name: 'photo.png', path: file, data: new Uint8Array(fs.readFileSync(file)) }
      ])
    }, image).catch(async () => {
      await win.evaluate((b64) => {
        const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        return window.__salahStore.getState().openFiles([{ name: 'photo.png', path: null, data }])
      }, PNG_2x1)
    })
    await waitFor((s) => s.tabs.length === 2 && s.active === 'photo.pdf' && s.pages.length === 1, 'image opened as PDF')
    await command('merge-all')
    await waitFor((s) => s.tabs.length === 3 && s.pages.length === 305, 'merge all')
    step('image opens as a PDF, merge all open files')

    // Extract the selection to a new tab, then split into parts in Downloads.
    await thumb(2).click()
    await thumb(4).click({ modifiers: ['Shift'] })
    await command('extract-pages')
    await waitFor((s) => s.tabs.length === 4 && s.pages.length === 3, 'extracted')
    await win.locator('.tab').nth(2).click()
    await command('split')
    await win.locator('.modal input[type="number"]').fill('100')
    await win.locator('.modal button.primary').click()
    await waitFor(() => fs.readdirSync(downloads).length === 5, 'split parts saved')
    const partPages = await Promise.all(
      [1, 2, 3, 4].map(async (n) =>
        (await PDFDocument.load(fs.readFileSync(path.join(downloads, `ملف مدمج - ${n}.pdf`)))).getPageCount()
      )
    )
    assert.deepEqual(partPages, [100, 100, 100, 5])
    step('extract selection, split every 100 pages into Downloads')

    if (screenshots) {
      await thumb(5).click()
      await thumb(7).click({ modifiers: ['Shift'] })
      await win.screenshot({ path: path.join(screenshots, 'pages.png') })
    }
    assert.deepEqual(errors, [])
    console.log('e2e test passed')
  } finally {
    // Skip the "unsaved changes" prompt so closing does not block the test.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {})
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
