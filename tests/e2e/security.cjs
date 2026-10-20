// End-to-end password & encryption: open a user-password PDF (prompt), then
// save an unprotected copy; and protect a plain PDF with a new password and
// verify the result needs that password.
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require(require('path').join(process.cwd(),'node_modules/@cantoo/pdf-lib'))
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path')
const step=(n)=>console.log('  ✓ '+n)
;(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sec spaces-')); const dl=path.join(dir,'dl'); fs.mkdirSync(dl)
  // Encrypted source (user password 'secret').
  const enc=await PDFDocument.create(); const f=await enc.embedFont(StandardFonts.Helvetica)
  for(let i=1;i<=2;i++){const p=enc.addPage([595,842]);p.drawText('Secret page '+i,{x:60,y:760,size:24,font:f})}
  await enc.encrypt({userPassword:'secret',ownerPassword:'owner',permissions:{printing:'lowResolution',copying:false}})
  const locked=path.join(dir,'locked.pdf'); fs.writeFileSync(locked, await enc.save())
  // Plain source to protect.
  const plain=await PDFDocument.create(); plain.addPage([595,842]).drawText('Plain',{x:60,y:760,size:24,font:await plain.embedFont(StandardFonts.Helvetica)})
  const plainPath=path.join(dir,'plain.pdf'); fs.writeFileSync(plainPath, await plain.save())

  const app=await electron.launch({args:['--no-sandbox','--disable-gpu','.',locked]})
  await app.evaluate(({app},d)=>app.setPath('downloads',d), dl)
  const errors=[]
  try{
    const win=await app.firstWindow();win.on('pageerror',e=>errors.push(String(e)));win.on('console',m=>m.type()==='error'&&errors.push(m.text()))
    // A password prompt should appear for the locked file.
    await win.waitForSelector('.modal input[type="password"]',{timeout:20000})
    step('encrypted file prompts for a password')
    // Wrong password first -> error shown, stays open.
    await win.fill('.modal input[type="password"]','nope'); await win.locator('.modal .primary').click()
    await win.waitForTimeout(600)
    assert.ok(await win.locator('.modal input[type="password"]').count()===1,'wrong password keeps the prompt')
    step('wrong password rejected')
    // Correct password -> opens.
    await win.fill('.modal input[type="password"]','secret'); await win.locator('.modal .primary').click()
    await win.waitForSelector('.page canvas',{timeout:20000})
    const pages=await win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages.length})
    assert.equal(pages,2)
    step('correct password opens the document (2 pages)')
    // Save -> unprotected copy to Downloads, must open with no password.
    await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p})}, path.join(dl,'unlocked.pdf'))
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu','save-as'))
    for(let i=0;i<60 && !fs.existsSync(path.join(dl,'unlocked.pdf'));i++)await win.waitForTimeout(100)
    const unlocked=await PDFDocument.load(fs.readFileSync(path.join(dl,'unlocked.pdf')))  // no password -> must succeed
    assert.equal(unlocked.getPageCount(),2)
    step('saved an unprotected copy (opens without a password)')

    // Now protect the plain file with a new password.
    await win.evaluate(([b64])=>{const data=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));return window.__salahStore.getState().openFiles([{name:'plain.pdf',path:null,data}])},[fs.readFileSync(plainPath).toString('base64')])
    await win.waitForTimeout(800)
    await win.evaluate(()=>window.__salahStore.getState().openDialog({kind:'protect'}))
    await win.waitForSelector('.modal[aria-label]')
    await win.locator('.password-input input').first().fill('newpass')
    await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p})}, path.join(dl,'protected.pdf'))
    await win.locator('.modal .primary').click()
    for(let i=0;i<80 && !fs.existsSync(path.join(dl,'protected.pdf'));i++)await win.waitForTimeout(100)
    await win.waitForTimeout(400)
    // Must require the password.
    let needsPw=false; try{ await PDFDocument.load(fs.readFileSync(path.join(dl,'protected.pdf'))) }catch{ needsPw=true }
    assert.ok(needsPw,'protected file requires a password')
    const ok=await PDFDocument.load(fs.readFileSync(path.join(dl,'protected.pdf')),{password:'newpass'})
    assert.equal(ok.getPageCount(),1)
    step('protected a file with a new password (needs it to open)')

    assert.deepEqual(errors.filter(e=>!/password/i.test(e)),[])
    console.log('security e2e passed')
  } finally { await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();fs.rmSync(dir,{recursive:true,force:true}) }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
