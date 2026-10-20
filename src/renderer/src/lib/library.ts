/** The user's saved signatures and custom stamps, kept on this device. */
export interface Library {
  signatures: string[]
  stamps: string[]
}

const KEY = 'salah-pdf:library'

export function loadLibrary(): Library {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Library>
    return { signatures: value.signatures ?? [], stamps: value.stamps ?? [] }
  } catch {
    return { signatures: [], stamps: [] }
  }
}

export function saveLibrary(library: Library): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(library))
    return true
  } catch {
    return false
  }
}
