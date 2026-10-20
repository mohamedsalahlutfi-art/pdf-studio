// Verifies portable data: settings persist across restarts AND are written to a
// `data` folder next to the executable (not to the host user profile).
const { _electron: electron } = require('playwright')
const fs=require('fs'),path=require('path')
const exe = process.argv[2]
const dataDir = path.join(path.dirname(exe), 'data')
;(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true })
  // First run: change language to English, then close.
  let app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'] })
  let win = await app.firstWindow()
  await win.waitForSelector('.welcome, .page', { timeout: 20000 })
  await win.evaluate(() => window.__salahStore.getState().toggleLanguage())
  await win.waitForTimeout(400)
  const lang1 = await win.evaluate(() => window.__salahStore.getState().language)
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{})
  await app.close()
  const wroteData = fs.existsSync(dataDir)
  // Second run: language should still be whatever we set.
  app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'] })
  win = await app.firstWindow()
  await win.waitForSelector('.welcome, .page', { timeout: 20000 })
  const lang2 = await win.evaluate(() => window.__salahStore.getState().language)
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{})
  await app.close()
  console.log(JSON.stringify({ lang1, lang2, persisted: lang1 === lang2, dataFolderNextToExe: wroteData }))
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
