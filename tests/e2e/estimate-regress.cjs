// Regression: repeated compression estimates must NOT detach the cached source,
// so rendering and saving keep working afterward (the "detached ArrayBuffer" bug).
const { _electron: electron } = require('playwright')
const { PDFDocument, StandardFonts } = require(require('path').join(process.cwd(),'node_modules/@cantoo/pdf-lib'))
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib')
;(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'est-')); const dl=path.join(dir,'dl'); fs.mkdirSync(dl)
  // image + text so compression has work
  const W=900,H=600,raw=Buffer.alloc(H*(1+W*3));for(let y=0;y<H;y++){raw[y*(1+W*3)]=0;for(let x=0;x<W;x++){const i=y*(1+W*3)+1+x*3;raw[i]=x*255/W|0;raw[i+1]=y*255/H|0;raw[i+2]=(x+y)%256}}
  function crc(b){let c=~0;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0}
  const ck=(t,b)=>{const l=Buffer.alloc(4);l.writeUInt32BE(b.length);const tt=Buffer.from(t);const c=Buffer.alloc(4);c.writeUInt32BE(crc(Buffer.concat([tt,b])));return Buffer.concat([l,tt,b,c])}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=2
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:3})),ck('IEND',Buffer.alloc(0))])
  const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);const im=await d.embedPng(png)
  const p=d.addPage([595,842]);p.drawImage(im,{x:40,y:300,width:515,height:380});p.drawText('Heading',{x:40,y:770,size:24,font:f})
  const input=path.join(dir,'d.pdf');fs.writeFileSync(input,await d.save())
  const app=await electron.launch({args:['--no-sandbox','--disable-gpu','.',input]})
  await app.evaluate(({app},d)=>app.setPath('downloads',d),dl)
  const errors=[];
  try{
    const win=await app.firstWindow();win.on('pageerror',e=>errors.push(String(e)));win.on('console',m=>m.type()==='error'&&errors.push(m.text()))
    await win.waitForSelector('.page canvas',{timeout:25000})
    // Run the estimate 4 times with different options (like the live panel does).
    const sizes=[]
    for(const q of [0.3,0.5,0.7,0.9]){
      const r=await win.evaluate((q)=>window.__salahStore.getState().estimateCompression({maxImagePixels:1600,imageQuality:q,minSaving:0.05,stripMetadata:true}),q)
      assert.ok(r && r.bytesAfter>0, 'estimate returned a size for q='+q)
      sizes.push(r.bytesAfter)
    }
    console.log('  ✓ 4 repeated estimates OK:', sizes.map(s=>(s/1024|0)+'KB').join(', '))
    // Source must still be usable: save a normal (non-compressed) copy.
    await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p})}, path.join(dl,'saved.pdf'))
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu','save-as'))
    for(let i=0;i<60 && !fs.existsSync(path.join(dl,'saved.pdf'));i++)await win.waitForTimeout(100)
    const re=await PDFDocument.load(fs.readFileSync(path.join(dl,'saved.pdf')))
    assert.equal(re.getPageCount(),1,'source still saves after estimates')
    console.log('  ✓ source not detached — save works after estimating')
    const detached = errors.filter(e=>/detached|out-of-bounds/i.test(e))
    assert.deepEqual(detached, [], 'no detached-buffer errors')
    console.log('estimate-regress passed')
  } finally { await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();fs.rmSync(dir,{recursive:true,force:true}) }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)})
