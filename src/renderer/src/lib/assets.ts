import { newId } from './model'

/** Immutable PNG/JPEG images used by annotations (stamps, signatures, text boxes). */
export interface Asset {
  id: string
  bytes: Uint8Array
  url: string
  width: number
  height: number
  kind: 'png' | 'jpg'
}

const assets = new Map<string, Asset>()
const byDataUrl = new Map<string, Asset>()

export const getAsset = (id: string): Asset | undefined => assets.get(id)

async function register(bytes: Uint8Array, kind: Asset['kind']): Promise<Asset> {
  const blob = new Blob([bytes as BlobPart], { type: kind === 'png' ? 'image/png' : 'image/jpeg' })
  const bitmap = await createImageBitmap(blob)
  const asset: Asset = { id: newId('asset'), bytes, url: URL.createObjectURL(blob), width: bitmap.width, height: bitmap.height, kind }
  bitmap.close()
  assets.set(asset.id, asset)
  return asset
}

export async function assetFromCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Asset> {
  const blob =
    canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
      : await canvas.convertToBlob({ type: 'image/png' })
  return register(new Uint8Array(await blob.arrayBuffer()), 'png')
}

/** Assets from saved data URLs (signature/stamp library) are created once and reused. */
export async function assetFromDataUrl(dataUrl: string): Promise<Asset> {
  const cached = byDataUrl.get(dataUrl)
  if (cached) return cached
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
  const asset = await register(bytes, dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png')
  byDataUrl.set(dataUrl, asset)
  return asset
}

/** Any browser-decodable image, re-encoded to PNG unless it already is PNG or JPEG. */
export async function assetFromFile(name: string, data: Uint8Array): Promise<Asset> {
  if (/\.png$/i.test(name)) return register(data, 'png')
  if (/\.jpe?g$/i.test(name)) return register(data, 'jpg')
  const bitmap = await createImageBitmap(new Blob([data as BlobPart]))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return assetFromCanvas(canvas)
}
