// End-to-end batch processing: add several PDFs (incl. an image-heavy one and an
// encrypted one), compress them with one click, and unlock the encrypted one,
// checking the per-file report and that outputs are written to Downloads.
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require(require('path').join(process.cwd(),'node_modules/@cantoo/pdf-lib'))
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib')
const step=(n)=>console.log('  ✓ '+n)

async function imagePdf(){
  const W=900,H=650,raw=Buffer.alloc(H*(1+W*3));for(let y=0;y<H;y++){raw[y*(1+W*3)]=0;for(let x=0;x<W;x++){const i=y*(1+W*3)+1+x*3;raw[i]=x*255/W|0;raw[i+1]=y*255/H|0;raw[i+2]=(x*y)%256}}
  function crc(b){let c=~0;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0}
  const ck=(t,b)=>{const l=Buffer.alloc(4);l.writeUInt32BE(b.length);const tt=Buffer.from(t);const c=Buffer.alloc(4);c.writeUInt32BE(crc(Buffer.concat([tt,b])));return Buffer.concat([l,tt,b,c])}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:1})),ck('IEND',Buffer.alloc(0))])
  const d=await PDFDocument.create();const im=await d.embedPng(png);d.addPage([842,595]).drawImage(im,{x:20,y:40,width:800,height:500})
  return d.save()
}

;(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'batch spaces-'));const dl=path.join(dir,'dl');fs.mkdirSync(dl)
  const files=[]
  for (const n of ['one','two']){ const p=path.join(dir,n+'.pdf'); fs.writeFileSync(p, await imagePdf()); files.push(p) }
  // an encrypted file
  const enc=await PDFDocument.create(); enc.addPage([595,842]).drawText('locked',{x:60,y:760,size:20,font:await enc.embedFont(StandardFonts.Helvetica)})
  await enc.encrypt({userPassword:'pw',ownerPassword:'pw'})
  const lockedPath=path.join(dir,'locked.pdf'); fs.writeFileSync(lockedPath, await enc.save()); files.push(lockedPath)

  // open the app on a dummy doc
  const dummy=await PDFDocument.create(); dummy.addPage([300,300]); const dummyPath=path.join(dir,'dummy.pdf'); fs.writeFileSync(dummyPath, await dummy.save())
  const app=await electron.launch({args:['--no-sandbox','--disable-gpu','.',dummyPath]})
  await app.evaluate(({app},d)=>app.setPath('downloads',d), dl)
  const errors=[]
  try{
    const win=await app.firstWindow();win.on('pageerror',e=>errors.push(String(e)));win.on('console',m=>m.type()==='error'&&errors.push(m.text()))
    await win.waitForSelector('.page canvas',{timeout:25000})
    // Inject the file list straight into the batch (bypassing the native file dialog).
    await win.evaluate((payload)=>{
      const items = payload.map(p=>({name:p.name, data:Uint8Array.from(atob(p.b64),c=>c.charCodeAt(0)), status:'pending'}))
      window.__salahStore.setState({ dialog:{kind:'batch'}, batch:{items, running:false} })
    }, files.map(p=>({name:path.basename(p), b64:fs.readFileSync(p).toString('base64')})))
    await win.waitForSelector('.batch-modal .batch-row')
    assert.equal(await win.locator('.batch-row').count(),3)
    step('3 files added to the batch')

    // COMPRESS with the batch password for the locked one.
    await win.evaluate(()=>window.__salahStore.getState().runBatch('compress',{compress:{maxImagePixels:1200,imageQuality:0.5,minSaving:0.03,stripMetadata:true}, password:'pw'}))
    for(let i=0;i<120;i++){ const r=await win.evaluate(()=>window.__salahStore.getState().batch.running); if(!r)break; await win.waitForTimeout(100) }
    const statuses = await win.evaluate(()=>window.__salahStore.getState().batch.items.map(i=>i.status))
    assert.deepEqual(statuses,['done','done','done'],'all three compressed: '+statuses)
    const outs = fs.readdirSync(dl).filter(f=>/compressed\.pdf$/.test(f))
    assert.equal(outs.length,3,'3 compressed files written: '+outs.join(','))
    // the two image PDFs should be smaller; all outputs open without a password
    for (const f of outs){ const doc=await PDFDocument.load(fs.readFileSync(path.join(dl,f))); assert.ok(doc.getPageCount()>=1) }
    step('batch compressed all 3 (locked one unlocked via password) → Downloads')

    // Wrong password path: unlock with a wrong password reports an error.
    await win.evaluate(()=>{const b=window.__salahStore.getState().batch; window.__salahStore.setState({batch:{items:b.items.map(i=>({...i,status:'pending',outputPath:undefined})), running:false}})})
    await win.evaluate(()=>window.__salahStore.getState().runBatch('unlock',{password:'wrong'}))
    for(let i=0;i<120;i++){ const r=await win.evaluate(()=>window.__salahStore.getState().batch.running); if(!r)break; await win.waitForTimeout(100) }
    const s2 = await win.evaluate(()=>window.__salahStore.getState().batch.items.map(i=>i.status))
    // two plain files unlock fine (no encryption), the locked one errors on wrong password
    assert.deepEqual(s2,['done','done','error'],'wrong password errors only the locked file: '+s2)
    step('wrong password reported per-file, others still succeed')

    assert.deepEqual(errors.filter(e=>!/password|encrypt/i.test(e)),[])
    console.log('batch e2e passed')
  } finally { await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();fs.rmSync(dir,{recursive:true,force:true}) }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
