import { EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib'

/**
 * PDF password & encryption, built on @cantoo/pdf-lib.
 *
 * The whole app works on DECRYPTED bytes: an encrypted file is unlocked once at
 * open time (decryptPdf) and everything downstream — rendering, editing,
 * compression, saving — runs on the plaintext, exactly as for an unprotected
 * file. Re-protecting is a separate, explicit step (encryptPdf). We never claim
 * to bypass encryption: without the correct password, decryptPdf fails.
 */

/** Which PDF permissions an Owner password grants, decoded from the /P flag. */
export interface Permissions {
  printing: boolean
  highQualityPrinting: boolean
  modifying: boolean
  copying: boolean
  annotating: boolean
  fillingForms: boolean
}

export interface SecurityInfo {
  encrypted: boolean
  /** The file opens with an empty password (no user password; only owner restrictions). */
  opensWithoutPassword: boolean
  /** Restrictions in force, when known. null for an unencrypted file. */
  permissions: Permissions | null
}

export class WrongPasswordError extends Error {
  override name = 'WrongPasswordError'
}

const bit = (p: number, n: number): boolean => (p & (1 << (n - 1))) !== 0

/** Decodes a /P permission bitfield (standard security handler bit positions). */
export function decodePermissions(p: number): Permissions {
  return {
    printing: bit(p, 3),
    modifying: bit(p, 4),
    copying: bit(p, 5),
    annotating: bit(p, 6),
    fillingForms: bit(p, 9),
    highQualityPrinting: bit(p, 12)
  }
}

function readPermissions(doc: PDFDocument): Permissions | null {
  const encrypt = doc.context.lookup(doc.context.trailerInfo.Encrypt)
  if (!(encrypt instanceof PDFDict)) return null
  const p = encrypt.get(PDFName.of('P'))
  return p instanceof PDFNumber ? decodePermissions(p.asNumber()) : null
}

/** Inspects a file's protection without needing the password. */
export async function inspectSecurity(bytes: Uint8Array): Promise<SecurityInfo> {
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true })
  if (!probe.isEncrypted) return { encrypted: false, opensWithoutPassword: true, permissions: null }
  let opensWithoutPassword = false
  try {
    await PDFDocument.load(bytes, { password: '' })
    opensWithoutPassword = true
  } catch {
    // A real user (open) password is required.
  }
  return { encrypted: true, opensWithoutPassword, permissions: readPermissions(probe) }
}

/**
 * Returns the decrypted bytes of an encrypted file. The document is rebuilt into
 * a fresh one, which forces every object to be decrypted and produces a clean,
 * unprotected PDF. Throws WrongPasswordError when the password does not fit.
 */
export async function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  let src: PDFDocument
  try {
    src = await PDFDocument.load(bytes, { password })
  } catch (error) {
    if (error instanceof EncryptedPDFError || /password|encrypt/i.test(String(error))) throw new WrongPasswordError()
    throw error
  }
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, src.getPageIndices())
  for (const page of pages) out.addPage(page)
  return out.save({ useObjectStreams: true })
}

export interface EncryptOptions {
  /** Password required to OPEN the file. Empty means no open password (owner-only restrictions). */
  userPassword: string
  /** Password required to change permissions. Defaults to userPassword when empty. */
  ownerPassword: string
  permissions: Permissions
}

/** Encrypts already-plaintext bytes with the given passwords and permissions (AES-256). */
export async function encryptPdf(bytes: Uint8Array, options: EncryptOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  await doc.encrypt({
    userPassword: options.userPassword || undefined,
    ownerPassword: options.ownerPassword || options.userPassword || undefined,
    permissions: {
      printing: options.permissions.printing ? (options.permissions.highQualityPrinting ? 'highResolution' : 'lowResolution') : undefined,
      modifying: options.permissions.modifying,
      copying: options.permissions.copying,
      annotating: options.permissions.annotating,
      fillingForms: options.permissions.fillingForms,
      contentAccessibility: true,
      documentAssembly: options.permissions.modifying
    }
  })
  return doc.save({ useObjectStreams: true })
}
