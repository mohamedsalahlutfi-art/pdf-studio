// End-to-end test of smart compression and image export. Compresses an
// image-heavy PDF (big embedded picture + vector text), verifies the result is
// smaller, re-opens, keeps the page count and vector text, and exports PNG and
// a multi-page TIFF to Downloads. Run after `npm run build` (Linux: xvfb-run).
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib')

function makeImagePdfBytes() { return null }
const step = (n) => console.log(`  ✓ ${n}`)

;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salah-export-'))
  const downloads = path.join(dir, 'downloads'); fs.mkdirSync(downloads)
  const input = path.join(dir, 'photos.pdf')
  // Build the fixture inline (big PNG image + vector text on 3 pages).
  const W = 1200, H = 900
  const raw = Buffer.alloc(H * (1 + W * 3))
  for (let y = 0; y < H; y++) { raw[y*(1+W*3)]=0; for (let x = 0; x < W; x++){ const i=y*(1+W*3)+1+x*3; raw[i]=(x*255/W)|0; raw[i+1]=(y*255/H)|0; raw[i+2]=(x+y)%256 } }
  function crc32(b){let c=~0;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0}
  const chunk=(t,b)=>{const l=Buffer.alloc(4);l.writeUInt32BE(b.length);const tt=Buffer.from(t);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([tt,b])));return Buffer.concat([l,tt,b,c])}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:3})),chunk('IEND',Buffer.alloc(0))])
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const image = await doc.embedPng(png)
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842])
    page.drawImage(image, { x: 40, y: 300, width: 515, height: 400 })
    page.drawText(`Vector heading page ${i}`, { x: 40, y: 760, size: 26, font, color: rgb(0.1,0.1,0.1) })
    for (let l = 0; l < 6; l++) page.drawText(`Crisp vector line ${l+1}`, { x: 40, y: 250 - l*20, size: 12, font })
  }
  fs.writeFileSync(input, await doc.save())
  const originalSize = fs.statSync(input).size

  const app = await electron.launch({ args: ['--no-sandbox', `--user-data-dir=${path.join(dir,'p')}`, '.', input] })
  const errors = []
  try {
    await app.evaluate(({ app }, d) => app.setPath('downloads', d), downloads)
    const win = await app.firstWindow()
    win.on('pageerror', (e) => errors.push(String(e)))
    win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    const command = (name) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('menu', c), name)
    const state = () => win.evaluate(() => { const s = window.__salahStore.getState(); const t = s.tabs.find(x=>x.id===s.activeId); return { tabs: s.tabs.length, pages: t?.history.present.pages.length, busy: s.busy, dialog: s.dialog?.kind } })
    const waitFor = async (p, label) => { for (let i=0;i<120;i++){ if (p(await state())) return; await win.waitForTimeout(100) } throw new Error('timeout: '+label+' '+JSON.stringify(await state())+' err:'+errors.join('|')) }

    await win.waitForSelector('.page canvas', { timeout: 20000 })
    step('image-heavy PDF opened')

    // Compress via the store API with the screen preset, saving to Downloads.
    await win.evaluate(() => window.__salahStore.getState().compressAndSave({ maxImagePixels: 1600, imageQuality: 0.6, minSaving: 0.05, stripMetadata: true }, false))
    await waitFor((s) => s.busy === null, 'compression finished')
    const out = path.join(downloads, 'photos.pdf')
    for (let i=0;i<60 && !fs.existsSync(out);i++) await win.waitForTimeout(100)
    const compressedSize = fs.statSync(out).size
    assert.ok(compressedSize < originalSize * 0.85, `expected real shrink, got ${originalSize} -> ${compressedSize}`)
    const report = await win.evaluate(() => window.__salahStore.getState().lastCompression)
    assert.ok(report.imagesRecompressed >= 1, 'at least one image recompressed')
    step(`compressed ${(originalSize/1024|0)}KB -> ${(compressedSize/1024|0)}KB, ${report.imagesRecompressed} image(s)`)

    // Re-open the compressed file: page count and crisp vector text survive.
    const reDoc = await PDFDocument.load(fs.readFileSync(out))
    assert.equal(reDoc.getPageCount(), 3)
    await win.evaluate(([b64]) => { const data = Uint8Array.from(atob(b64), c=>c.charCodeAt(0)); return window.__salahStore.getState().openFiles([{ name:'re.pdf', path:null, data }]) }, [fs.readFileSync(out).toString('base64')])
    await win.waitForSelector('.page .textLayer span', { timeout: 15000 })
    const text = await win.locator('.page .textLayer').first().innerText()
    assert.ok(/Vector heading/.test(text), 'vector text is still real text after compression')
    step('reopened: 3 pages, vector text preserved and selectable')

    // Export images: PNG per page + multi-page TIFF.
    await win.evaluate(() => window.__salahStore.getState().exportImages('png', { dpi: 120, quality: 0.9 }, 'all'))
    await waitFor((s) => s.busy === null, 'png export done')
    await win.evaluate(() => window.__salahStore.getState().exportImages('tiff', { dpi: 100, quality: 0.9 }, 'all'))
    await waitFor((s) => s.busy === null, 'tiff export done')
    const files = fs.readdirSync(downloads)
    const pngs = files.filter((f) => f.endsWith('.png'))
    const tiffs = files.filter((f) => f.endsWith('.tiff'))
    assert.equal(pngs.length, 3, 'one PNG per page: ' + files.join(','))
    assert.equal(tiffs.length, 1, 'one multi-page TIFF')
    // PNG signature + TIFF magic sanity.
    assert.deepEqual([...fs.readFileSync(path.join(downloads, pngs[0])).subarray(0,4)], [137,80,78,71])
    const tiffHead = fs.readFileSync(path.join(downloads, tiffs[0]))
    assert.equal(tiffHead.readUInt16LE(0), 0x4949)
    assert.equal(tiffHead.readUInt16LE(2), 42)
    step('exported 3 PNGs and a multi-page TIFF')

    assert.deepEqual(errors, [])
    console.log('export/compress e2e passed')
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{})
    await app.close(); fs.rmSync(dir, { recursive: true, force: true })
  }
})().catch(e => { console.error(e); process.exit(1) })
