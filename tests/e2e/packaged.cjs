// Exercises the headline features against the PACKAGED (asar) app: annotation,
// stamp, compression, image export — verifying the distribution, not the dev build.
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts, PDFName, PDFArray } = require(require('path').join(process.cwd(),'node_modules/@cantoo/pdf-lib'))
const fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib')
const exe = process.argv[2]
const step=(n)=>console.log('  ✓ '+n)
;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg feat spaces-'))
  const dl = path.join(dir,'dl'); fs.mkdirSync(dl)
  const input = path.join(dir, 'doc.pdf')
  // Vector text + a big embedded PNG so compression has something to shrink.
  const W=1000,H=700, raw=Buffer.alloc(H*(1+W*3))
  for(let y=0;y<H;y++){raw[y*(1+W*3)]=0;for(let x=0;x<W;x++){const i=y*(1+W*3)+1+x*3;raw[i]=x*255/W|0;raw[i+1]=y*255/H|0;raw[i+2]=(x+y)%256}}
  function crc32(b){let c=~0;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0}
  const ck=(t,b)=>{const l=Buffer.alloc(4);l.writeUInt32BE(b.length);const tt=Buffer.from(t);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([tt,b])));return Buffer.concat([l,tt,b,c])}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:3})),ck('IEND',Buffer.alloc(0))])
  const doc=await PDFDocument.create(); const f=await doc.embedFont(StandardFonts.Helvetica); const img=await doc.embedPng(png)
  for(let i=1;i<=2;i++){const p=doc.addPage([595,842]); p.drawImage(img,{x:40,y:300,width:515,height:380}); p.drawText('Report heading '+i,{x:40,y:770,size:24,font:f}); for(let l=0;l<6;l++)p.drawText('Selectable line '+(l+1),{x:40,y:260-l*20,size:13,font:f})}
  fs.writeFileSync(input, await doc.save())
  const original = fs.statSync(input).size

  const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox','--disable-gpu','--disable-software-rasterizer', input] })
  await app.evaluate(({app},d)=>app.setPath('downloads',d), dl)
  const errors=[]
  try{
    const win=await app.firstWindow(); win.on('pageerror',e=>errors.push(String(e))); win.on('console',m=>m.type()==='error'&&errors.push(m.text()))
    const anns=()=>win.evaluate(()=>{const s=window.__salahStore.getState();const t=s.tabs.find(x=>x.id===s.activeId);return t.history.present.pages[0].annotations?.map(a=>a.type==='image'?'image:'+a.kind:a.type)??[]})
    const waitBusy=async()=>{for(let i=0;i<120;i++){if((await win.evaluate(()=>window.__salahStore.getState().busy))===null)return;await win.waitForTimeout(100)}}
    await win.waitForSelector('.page[data-page="1"] canvas',{timeout:25000})
    await win.waitForSelector('.page[data-page="1"] .textLayer span')
    await win.evaluate(()=>{const s=window.__salahStore.getState(); if(s.language!=='ar')s.toggleLanguage()}); await win.waitForTimeout(200)
    step('packaged app opened image+text PDF (path with spaces)')

    // Annotation: a highlight by selecting text.
    await win.locator('.tool-rail .rail-item').nth(1).click()
    await win.evaluate(()=>window.__salahStore.getState().setZoom(0.9))
    await win.waitForTimeout(300)
    await win.locator('.ribbon-tool',{hasText:'تظليل'}).click()
    const t=await win.locator('.textLayer span',{hasText:'Report heading 1'}).boundingBox()
    await win.mouse.move(t.x+2,t.y+t.height/2); await win.mouse.down(); await win.mouse.move(t.x+t.width-2,t.y+t.height/2,{steps:6}); await win.mouse.up()
    for(let i=0;i<40&&!(await anns()).includes('highlight');i++)await win.waitForTimeout(100)
    if(!(await anns()).includes('highlight'))throw new Error('highlight not created')
    step('highlight annotation created')

    // Stamp: place the first ready-made stamp.
    await win.locator('.ribbon-tool',{hasText:'أختام'}).click()
    await win.locator('.stamp-option').first().click()
    for(let i=0;i<40&&(await win.evaluate(()=>window.__salahStore.getState().tool))!=='place';i++)await win.waitForTimeout(100)
    const pg=await win.locator('.page[data-page="1"]').boundingBox()
    await win.locator('.page[data-page="1"]').click({position:{x:pg.width*0.6,y:pg.height*0.7}})
    for(let i=0;i<40&&!(await anns()).includes('image:stamp');i++)await win.waitForTimeout(100)
    if(!(await anns()).includes('image:stamp'))throw new Error('stamp not placed')
    step('stamp placed')

    // Save (annotations flatten; note kept) and reopen.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu','save'))
    await waitBusy()
    const out=path.join(dl,'doc.pdf')
    for(let i=0;i<60&&!fs.existsSync(out);i++)await win.waitForTimeout(100)
    const saved=await PDFDocument.load(fs.readFileSync(out))
    if(saved.getPageCount()!==2)throw new Error('page count changed')
    step('saved with annotations flattened, reopened (2 pages)')

    // Compress (Save As) and check it shrank. Stub the dialog first.
    await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p})}, path.join(dl,'small.pdf'))
    await win.evaluate(()=>window.__salahStore.getState().compressAndSave({maxImagePixels:1200,imageQuality:0.5,minSaving:0.05,stripMetadata:true}, true))
    await waitBusy()
    const small=path.join(dl,'small.pdf')
    for(let i=0;i<60&&!fs.existsSync(small);i++)await win.waitForTimeout(100)
    const smallSize=fs.statSync(small).size
    if(!(smallSize<original*0.85))throw new Error('not compressed: '+original+'->'+smallSize)
    step('compressed '+(original/1024|0)+'KB -> '+(smallSize/1024|0)+'KB')

    // Export PNG.
    await win.evaluate(()=>window.__salahStore.getState().exportImages('png',{dpi:100,quality:0.9},'all'))
    await waitBusy()
    const pngs=fs.readdirSync(dl).filter(x=>x.endsWith('.png'))
    if(pngs.length!==2)throw new Error('expected 2 PNGs, got '+pngs.join(','))
    step('exported 2 PNG pages')

    if(errors.length)throw new Error('console errors: '+errors.join(' | '))
    console.log('PACKAGED FEATURES OK')
  } finally {
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{})
    await app.close(); fs.rmSync(dir,{recursive:true,force:true})
  }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
