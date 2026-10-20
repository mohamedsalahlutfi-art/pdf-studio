// Tests stamp-on-multiple-pages, crop, and right-click duplicate on annotations.
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require(require('path').join(process.cwd(),'node_modules/@cantoo/pdf-lib'))
const assert=require('assert/strict'), fs=require('fs'),os=require('os'),path=require('path')
const step=(n)=>console.log('  ✓ '+n)
;(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multi-'))
  const d=await PDFDocument.create(); const f=await d.embedFont(StandardFonts.Helvetica)
  for(let i=1;i<=4;i++){const p=d.addPage([595,842]); p.drawText('Page '+i,{x:60,y:760,size:24,font:f})}
  const input=path.join(dir,'d.pdf'); fs.writeFileSync(input, await d.save())
  const app=await electron.launch({args:['--no-sandbox','--disable-gpu','.',input]})
  const errors=[]
  try{
    const win=await app.firstWindow(); win.on('pageerror',e=>errors.push(String(e)));win.on('console',m=>m.type()==='error'&&errors.push(m.text()))
    await win.waitForSelector('.page[data-page="1"] canvas',{timeout:25000})
    await win.evaluate(()=>{const s=window.__salahStore.getState(); if(s.language!=='ar')s.toggleLanguage()})
    await win.locator('.tool-rail .rail-item').nth(1).click()
    await win.evaluate(()=>window.__salahStore.getState().setZoom(0.85)); await win.waitForTimeout(300)
    const annCount=(pi)=>win.evaluate((i)=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages[i].annotations?.length??0},pi)

    // Place a stamp on page 1.
    await win.locator('.ribbon-tool',{hasText:'أختام'}).click()
    await win.locator('.stamp-option').first().click()
    for(let i=0;i<40&&(await win.evaluate(()=>window.__salahStore.getState().tool))!=='place';i++)await win.waitForTimeout(100)
    const pg=await win.locator('.page[data-page="1"]').boundingBox()
    await win.locator('.page[data-page="1"]').click({position:{x:pg.width*0.5,y:pg.height*0.5}})
    for(let i=0;i<40&&(await annCount(0))<1;i++)await win.waitForTimeout(100)
    assert.equal(await annCount(0),1)
    step('stamp placed on page 1')

    // Right-click the stamp -> "copy to other pages" -> all pages.
    const stampBox = await win.locator('.page[data-page="1"] .annotation-layer .ann').first().boundingBox()
    await win.mouse.click(stampBox.x+stampBox.width/2, stampBox.y+stampBox.height/2, {button:'right'})
    await win.waitForSelector('.context-menu')
    await win.locator('.context-menu .menu-item',{hasText:'نسخ على صفحات أخرى'}).click()
    await win.waitForSelector('.apply-grid')
    await win.locator('.apply-grid button',{hasText:'كل الصفحات'}).click()
    await win.waitForTimeout(400)
    const counts = await Promise.all([0,1,2,3].map(annCount))
    assert.deepEqual(counts,[1,1,1,1],'stamp on every page: '+counts)
    step('stamp copied to all 4 pages')

    // Right-click duplicate on page 1 -> 2 annotations there.
    await win.mouse.click(stampBox.x+stampBox.width/2, stampBox.y+stampBox.height/2, {button:'right'})
    await win.waitForSelector('.context-menu')
    await win.locator('.context-menu .menu-item',{hasText:'تكرار'}).click()
    await win.waitForTimeout(300)
    assert.equal(await annCount(0),2,'duplicated on page 1')
    step('right-click duplicate works')

    // Crop the stamp: right-click -> crop -> drag -> Crop.
    await win.mouse.click(stampBox.x+stampBox.width/2, stampBox.y+stampBox.height/2, {button:'right'})
    await win.waitForSelector('.context-menu')
    await win.locator('.context-menu .menu-item',{hasText:'قص الصورة'}).click()
    await win.waitForSelector('.crop-area')
    const ca=await win.locator('.crop-area').boundingBox()
    await win.mouse.move(ca.x+ca.width*0.2, ca.y+ca.height*0.2); await win.mouse.down(); await win.mouse.move(ca.x+ca.width*0.7, ca.y+ca.height*0.7,{steps:8}); await win.mouse.up()
    const sel = await win.evaluate(()=>window.__salahStore.getState().selectedAnnotation)
    const assetOf = (id)=>win.evaluate((id)=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);const a=t.history.present.pages[0].annotations.find(x=>x.id===id);return a&&a.assetId},id)
    const before = await assetOf(sel.id)
    await win.locator('.modal button.primary',{hasText:'قص'}).click()
    await win.waitForTimeout(600)
    const after = await assetOf(sel.id)
    assert.ok(before && after && before!==after, 'crop produced a new asset ('+before+' -> '+after+')')
    step('stamp cropped (new image)')

    if(errors.length)throw new Error('errors: '+errors.join(' | '))
    console.log('stamp-multi e2e passed')
  } finally { await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{}); await app.close(); fs.rmSync(dir,{recursive:true,force:true}) }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
