// Tests the comments list and properties inspector in the right panel.
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require(require('path').join(process.cwd(),'node_modules/@cantoo/pdf-lib'))
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path')
const step=(n)=>console.log('  ✓ '+n)
;(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rp-'))
  const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica)
  for(let i=1;i<=2;i++){const p=d.addPage([595,842]);p.drawText('Heading '+i,{x:60,y:760,size:24,font:f})}
  fs.writeFileSync(path.join(dir,'d.pdf'),await d.save())
  const app=await electron.launch({args:['--no-sandbox','--disable-gpu','.',path.join(dir,'d.pdf')]})
  const errors=[]
  try{
    const win=await app.firstWindow();win.on('pageerror',e=>errors.push(String(e)));win.on('console',m=>m.type()==='error'&&errors.push(m.text()))
    await win.waitForSelector('.page canvas',{timeout:25000})
    await win.evaluate(()=>{const s=window.__salahStore.getState(); if(s.language!=='ar')s.toggleLanguage()})
    await win.locator('.tool-rail .rail-item').nth(1).click()
    await win.evaluate(()=>window.__salahStore.getState().setZoom(0.85)); await win.waitForTimeout(300)
    const pg=await win.locator('.page[data-page="1"]').boundingBox()

    // Draw a rectangle annotation.
    await win.locator('.ribbon-tool',{hasText:'مربع'}).click()
    await win.mouse.move(pg.x+pg.width*0.2,pg.y+pg.height*0.3);await win.mouse.down();await win.mouse.move(pg.x+pg.width*0.5,pg.y+pg.height*0.45,{steps:6});await win.mouse.up()
    await win.waitForTimeout(300)
    assert.equal(await win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages[0].annotations?.length??0}),1)
    step('rectangle annotation drawn')

    // Open comments panel -> should list 1 comment.
    await win.locator('.tool-group.end .tool').first().click()
    await win.waitForSelector('.right-panel .comment-row')
    assert.equal(await win.locator('.comment-row').count(),1)
    step('comments panel lists the annotation')

    // Select the annotation, then open properties -> it reflects the selection.
    await win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);const a=t.history.present.pages[0].annotations[0];s.selectAnnotation({pageId:t.history.present.pages[0].id,id:a.id})})
    await win.locator('.tool-group.end .tool').nth(1).click()
    await win.waitForSelector('.properties')
    await win.locator('.properties .swatch[style*="30, 136, 229"], .properties .swatch[style*="#1e88e5"]').first().click()
    await win.waitForTimeout(200)
    const color = await win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages[0].annotations[0].color})
    assert.equal(color.toLowerCase(),'#1e88e5','color changed via properties')
    step('properties: color changed to blue')

    // Change thickness.
    const width0 = await win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages[0].annotations[0].width})
    await win.evaluate(()=>window.__salahStore.getState().patchSelectedAnnotation({width:8}))
    const width1 = await win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages[0].annotations[0].width})
    assert.ok(width1===8 && width1!==width0,'thickness changed')
    step('properties: thickness changed')

    if(errors.length)throw new Error('errors: '+errors.join(' | '))
    console.log('right-panel e2e passed')
  } finally { await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();fs.rmSync(dir,{recursive:true,force:true}) }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
