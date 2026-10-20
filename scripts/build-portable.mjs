// Builds a standalone, portable Windows x64 distribution of Salah PDF.
//
// It does NOT touch the development tree: it produces a self-contained folder
// and a zip under dist-portable/. The app's code is packed into an asar archive
// (out/ only — no source, tests or dev tooling), dropped onto a clean Electron
// Windows runtime, and the launcher is renamed to "Salah PDF.exe".
//
// Reproducible: run `npm run portable` after any change. No Wine, Node or Git is
// needed on the target machine to RUN the result — only to build it here.
//
// Usage: node scripts/build-portable.mjs
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { deflateRawSync } from 'node:zlib'
import {
  cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const ELECTRON_VERSION = require('electron/package.json').version
const ARCH = 'x64'
const PRODUCT = pkg.build.productName // "Salah PDF"
const VERSION = pkg.version

const dist = join(root, 'dist-portable')
const cache = join(dist, '.cache')
const stage = join(dist, 'stage')
const portableName = `${PRODUCT} ${VERSION}` // folder shown after unzip
const portableDir = join(stage, portableName)
const log = (m) => console.log(`• ${m}`)

// --- step 1: build the renderer/main/preload bundles -------------------------
log('building app bundles (npm run build)')
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })

rmSync(stage, { recursive: true, force: true })
mkdirSync(cache, { recursive: true })
mkdirSync(portableDir, { recursive: true })

// --- step 2: pack the app into an asar (out/ only) ---------------------------
log('packing app.asar (production code only)')
const appStage = join(dist, 'app')
rmSync(appStage, { recursive: true, force: true })
mkdirSync(appStage, { recursive: true })
cpSync(join(root, 'out'), join(appStage, 'out'), { recursive: true })
// A minimal production manifest: enough for Electron to start, nothing more.
writeFileSync(
  join(appStage, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      productName: PRODUCT,
      version: VERSION,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      main: 'out/main/index.js'
    },
    null,
    2
  )
)
const asarBin = join(root, 'node_modules', '.bin', 'asar')
const appAsar = join(dist, 'app.asar')
execFileSync(asarBin, ['pack', appStage, appAsar], { stdio: 'inherit' })

// --- step 3: fetch a clean Electron Windows runtime --------------------------
const zipName = `electron-v${ELECTRON_VERSION}-win32-${ARCH}.zip`
const zipPath = join(cache, zipName)
if (!existsSync(zipPath)) {
  const url = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${zipName}`
  log(`downloading ${zipName}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download Electron: ${res.status} ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
}
log('extracting Electron runtime')
const unzipper = require('unzipper')
await (await unzipper.Open.file(zipPath)).extract({ path: portableDir })

// --- step 4: turn the runtime into the Salah PDF portable app ----------------
log('assembling portable app')
renameSync(join(portableDir, 'electron.exe'), join(portableDir, `${PRODUCT}.exe`))
const resources = join(portableDir, 'resources')
rmSync(join(resources, 'default_app.asar'), { force: true })
cpSync(appAsar, join(resources, 'app.asar'))

// Store user data next to the executable so the app is truly portable: nothing
// is written to the developer's machine, and uninstalling is just deleting the
// folder. The main process reads this marker (see main/index.ts).
writeFileSync(join(portableDir, 'portable.txt'), 'Salah PDF portable data marker. Do not delete to keep settings next to the app.\n')

// --- step 5: licence, readme, version ----------------------------------------
const year = new Date().getFullYear()
writeFileSync(
  join(portableDir, 'LICENSE.txt'),
  `${PRODUCT} ${VERSION}\nCopyright (c) ${year} ${pkg.author?.name ?? ''}\n\n` +
    `This software is released under the MIT License.\n\n` +
    `It bundles the Electron runtime and the Chromium engine, each distributed\n` +
    `under their own licenses (see LICENSE.electron.txt and LICENSES.chromium.html\n` +
    `in this folder). pdf.js (Apache-2.0) and @cantoo/pdf-lib (MIT) are included in\n` +
    `the application bundle.\n`
)
writeFileSync(
  join(portableDir, 'README.txt'),
  [
    `${PRODUCT} ${VERSION} — Portable (Windows x64)`,
    ``,
    `التشغيل:`,
    `  1. فك ضغط هذا المجلد بالكامل في أي مكان (سطح المكتب، فلاشة، ...).`,
    `  2. شغّل "${PRODUCT}.exe".`,
    `  لا حاجة لتثبيت، ولا صلاحيات مدير، ولا إنترنت للوظائف الأساسية.`,
    ``,
    `أين تُحفظ بياناتك:`,
    `  الإعدادات ومكتبة التواقيع تُحفظ بجانب البرنامج داخل مجلد "data".`,
    `  انقل المجلد كاملاً لتنقل معه إعداداتك. حذف البرنامج = حذف المجلد.`,
    `  ملفات PDF التي تحفظها تذهب إلى مجلد التنزيلات أو حيث تختار "حفظ باسم".`,
    ``,
    `المميزات: عرض سريع، تبويبات، تدوير/دمج/تقسيم/استخراج الصفحات، ترقيم،`,
    `  تعليقات ورسم وأشكال وملاحظات، أختام وتوقيعات، إزالة خلفية بيضاء،`,
    `  ضغط ذكي وتصدير صور (PNG/WebP/JPEG/TIFF).`,
    ``,
    `قيود هذه النسخة:`,
    `  - أيقونة ومعلومات الإصدار على الملف التنفيذي قد تظهر باسم Electron`,
    `    الافتراضي (ختم الأيقونة يتطلب أدوات Windows لم تتوفر وقت البناء).`,
    `  - التغليف يصعّب قراءة الكود لكنه لا يمنع الهندسة العكسية منعاً مطلقاً.`,
    ``,
    `Run: unzip, then launch "${PRODUCT}.exe". No install, admin, or internet needed.`,
    `Your settings live in the "data" folder next to the app — move the folder to`,
    `move your settings. Saved PDFs go to Downloads or your chosen "Save As" path.`,
    ``,
    `Copyright (c) ${year} ${pkg.author?.name ?? ''} — MIT License (see LICENSE.txt).`
  ].join('\n') + '\n'
)
writeFileSync(join(portableDir, 'VERSION'), `${PRODUCT} ${VERSION}\nelectron ${ELECTRON_VERSION}\n`)

// --- step 6: zip the portable folder -----------------------------------------
log('creating zip')
const zipOut = join(dist, `Salah-PDF-Portable-${VERSION}.zip`)
zipFolder(stage, zipOut)
rmSync(appStage, { recursive: true, force: true })
// A SHA-256 so recipients can verify the download arrived intact and unmodified.
const sha = createHash('sha256').update(readFileSync(zipOut)).digest('hex')
const checksumPath = `${zipOut}.sha256.txt`
writeFileSync(checksumPath, `${sha}  ${zipOut.split('/').pop()}\n`)
log(`done: ${relative(root, zipOut)}  (${(statSync(zipOut).size / 1048576).toFixed(1)} MB)`)
log(`sha256: ${sha}`)
log(`folder: ${relative(root, portableDir)}`)

// --- minimal ZIP writer (store+deflate), no external deps --------------------
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c >>> 0) >>> 0
}

function walk(dir, base, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, base, files)
    else files.push({ full, name: relative(base, full).split('\\').join('/') })
  }
  return files
}

function zipFolder(sourceRoot, outPath) {
  const files = walk(sourceRoot, sourceRoot)
  const central = []
  const chunks = []
  let offset = 0
  for (const file of files) {
    const data = readFileSync(file.full)
    const crc = crc32(data)
    const deflated = data.length ? deflateRawSync(data, { level: 6 }) : Buffer.alloc(0)
    const useDeflate = deflated.length < data.length
    const method = useDeflate ? 8 : 0
    const body = useDeflate ? deflated : data
    const nameBuf = Buffer.from(file.name, 'utf8')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(0, 10) // time/date (fixed, reproducible)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    chunks.push(local, nameBuf, body)

    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(method, 10)
    header.writeUInt32LE(0, 12)
    header.writeUInt32LE(crc, 16)
    header.writeUInt32LE(body.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(nameBuf.length, 28)
    header.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([header, nameBuf]))
    offset += local.length + nameBuf.length + body.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  writeFileSync(outPath, Buffer.concat([...chunks, centralBuf, end]))
}
