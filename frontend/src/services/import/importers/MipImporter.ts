import JSZip from 'jszip'
import { Importer, ImportAnalysis } from '../Importer'
import type { ExcalidrawScene } from '../../../types'
import { buildImageScene } from './ImageImporter'

export interface MipManifest {
  schemaVersion: string
  source: string
  boardName: string
  totalAssets?: number
  totalImgTags?: number
  totalSvg?: number
  generatedBy?: string
}

export interface MipAssetEntry {
  id: string
  file: string
  mime: string
  sha256?: string
  bytes?: number
  width: number
  height: number
}

export interface MipObjectBounds {
  x: number | null
  y: number | null
  width: number
  height: number
}

export interface MipBoardObject {
  id: string
  type: string
  assetId: string
  bounds: MipObjectBounds
  rotation?: number
  layer?: number
  style?: string
  domIndex?: number
  parent?: string
}

export class MipImporter implements Importer {
  public name = 'Mosaic Import Package (MIP v1.0)'
  public supportedMimeTypes = ['application/zip', 'application/x-zip-compressed', 'application/x-zip']

  public supports(file: File): boolean {
    return (
      file.name.endsWith('.mip.zip') ||
      file.name.endsWith('.zip') ||
      this.supportedMimeTypes.includes(file.type)
    )
  }

  private findZipFile(zip: JSZip, targetPath: string): JSZip.JSZipObject | null {
    if (zip.file(targetPath)) return zip.file(targetPath)!
    const normalized = targetPath.replace(/\\/g, '/')
    if (zip.file(normalized)) return zip.file(normalized)!
    const basename = normalized.split('/').pop()
    for (const relativePath of Object.keys(zip.files)) {
      if (relativePath.endsWith(basename!)) {
        return zip.file(relativePath)!
      }
    }
    return null
  }

  private async computeSha256(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private parseAssetsList(assetsRaw: any): MipAssetEntry[] {
    if (!assetsRaw) return []
    if (Array.isArray(assetsRaw)) {
      return assetsRaw.map((item, idx) => ({
        id: String(item.id || item.assetId || item.name || `asset-${idx}`),
        file: String(item.file || item.path || item.src || item.fileName || ''),
        mime: String(item.mime || item.mimeType || item.type || 'image/png'),
        sha256: item.sha256 || item.checksum || '',
        bytes: Number(item.bytes || item.size || 0),
        width: Number(item.width || item.w || 0),
        height: Number(item.height || item.h || 0),
      }))
    }
    if (Array.isArray(assetsRaw.assets)) return this.parseAssetsList(assetsRaw.assets)
    if (Array.isArray(assetsRaw.items)) return this.parseAssetsList(assetsRaw.items)
    if (typeof assetsRaw === 'object' && assetsRaw !== null) {
      return Object.entries(assetsRaw).map(([key, item]: [string, any], idx) => {
        const objVal = typeof item === 'object' && item !== null ? item : {}
        return {
          id: String(objVal.id || objVal.assetId || key || `asset-${idx}`),
          file: String(objVal.file || objVal.path || objVal.src || (typeof item === 'string' ? item : '')),
          mime: String(objVal.mime || objVal.mimeType || objVal.type || 'image/png'),
          sha256: objVal.sha256 || objVal.checksum || '',
          bytes: Number(objVal.bytes || objVal.size || 0),
          width: Number(objVal.width || objVal.w || 0),
          height: Number(objVal.height || objVal.h || 0),
        }
      })
    }
    return []
  }

  private parseObjectsList(boardRaw: any): MipBoardObject[] {
    if (!boardRaw) return []
    if (Array.isArray(boardRaw)) return boardRaw as MipBoardObject[]
    if (Array.isArray(boardRaw.objects)) return boardRaw.objects as MipBoardObject[]
    if (Array.isArray(boardRaw.items)) return boardRaw.items as MipBoardObject[]
    if (Array.isArray(boardRaw.elements)) return boardRaw.elements as MipBoardObject[]
    if (typeof boardRaw === 'object' && boardRaw !== null) {
      const list: MipBoardObject[] = []
      for (const [key, val] of Object.entries(boardRaw)) {
        if (typeof val === 'object' && val !== null) {
          const v = val as any
          list.push({
            id: String(v.id || key),
            type: String(v.type || 'image'),
            assetId: String(v.assetId || v.asset || key),
            bounds: v.bounds || { x: v.x ?? null, y: v.y ?? null, width: v.width || v.w || 0, height: v.height || v.h || 0 },
            rotation: Number(v.rotation || 0),
            layer: Number(v.layer || 0),
            style: String(v.style || ''),
            domIndex: Number(v.domIndex ?? 0),
            parent: String(v.parent || 'div'),
          })
        }
      }
      return list
    }
    return []
  }

  private resolveAsset(
    assetLookup: Map<string, { dataURL: string; width: number; height: number; mime: string }>,
    targetId: string,
    assetsList: MipAssetEntry[]
  ): { dataURL: string; width: number; height: number; mime: string } | null {
    if (!targetId) return null
    if (assetLookup.has(targetId)) return assetLookup.get(targetId)!
    const lowerTarget = String(targetId).toLowerCase().trim()
    for (const [k, val] of assetLookup.entries()) {
      if (k.toLowerCase().trim() === lowerTarget) return val
    }
    const numTarget = lowerTarget.replace(/[^0-9]/g, '')
    if (numTarget) {
      for (const [k, val] of assetLookup.entries()) {
        const numK = k.toLowerCase().replace(/[^0-9]/g, '')
        if (numK && (numTarget === numK || parseInt(numTarget, 10) === parseInt(numK, 10))) return val
      }
      const idx = parseInt(numTarget, 10)
      if (!isNaN(idx) && idx >= 0 && idx < assetsList.length) {
        const entry = assetsList[idx]
        if (entry && assetLookup.has(entry.id)) return assetLookup.get(entry.id)!
      }
    }
    if (assetLookup.size === 1) return assetLookup.values().next().value!
    return null
  }

  public async analyze(file: File): Promise<ImportAnalysis> {
    try {
      const zip = await JSZip.loadAsync(file)
      const manifestFile = this.findZipFile(zip, 'manifest.json')
      const boardFile = this.findZipFile(zip, 'board.json')
      const assetsFile = this.findZipFile(zip, 'assets.json')
      const diagnosticsFile = this.findZipFile(zip, 'diagnostics.json')
      const hasImagesFolder = Object.keys(zip.files).some((f) => f.startsWith('images/') || f.includes('/images/'))

      if (!manifestFile || !boardFile || !assetsFile || !diagnosticsFile || !hasImagesFolder) {
        const missing: string[] = []
        if (!manifestFile) missing.push('manifest.json')
        if (!boardFile) missing.push('board.json')
        if (!assetsFile) missing.push('assets.json')
        if (!diagnosticsFile) missing.push('diagnostics.json')
        if (!hasImagesFolder) missing.push('images/ folder')
        return { fileName: file.name, fileSize: file.size, mimeType: 'application/zip', isValid: false, error: `Invalid MIP v1.0 package. Missing: ${missing.join(', ')}.` }
      }

      const manifest: MipManifest = JSON.parse(await manifestFile.async('string'))
      if (manifest.schemaVersion !== '1.0') {
        return { fileName: file.name, fileSize: file.size, mimeType: 'application/zip', isValid: false, error: `Unsupported MIP schemaVersion "${manifest.schemaVersion}". Requires 1.0.` }
      }

      const objects = this.parseObjectsList(JSON.parse(await boardFile.async('string')))
      return {
        fileName: file.name, fileSize: file.size, mimeType: 'application/zip',
        pagesCount: objects.length,
        estimatedBoardSize: { width: 1920, height: Math.max(1080, objects.length * 600) },
        estimatedUploadSize: file.size, isValid: true,
      }
    } catch (e: any) {
      return { fileName: file.name, fileSize: file.size, mimeType: 'application/zip', isValid: false, error: e.message || 'Corrupted or unreadable ZIP archive.' }
    }
  }

  public async import(
    file: File,
    onProgress: (phase: string, percent: number) => void
  ): Promise<ExcalidrawScene> {
    onProgress('Opening & Validating MIP Package...', 5)
    const zip = await JSZip.loadAsync(file)

    const manifestFile = this.findZipFile(zip, 'manifest.json')
    const boardFile = this.findZipFile(zip, 'board.json')
    const assetsFile = this.findZipFile(zip, 'assets.json')
    const diagnosticsFile = this.findZipFile(zip, 'diagnostics.json')
    const hasImagesFolder = Object.keys(zip.files).some((f) => f.startsWith('images/') || f.includes('/images/'))

    if (!manifestFile || !boardFile || !assetsFile || !diagnosticsFile || !hasImagesFolder) {
      const missing: string[] = []
      if (!manifestFile) missing.push('manifest.json')
      if (!boardFile) missing.push('board.json')
      if (!assetsFile) missing.push('assets.json')
      if (!diagnosticsFile) missing.push('diagnostics.json')
      if (!hasImagesFolder) missing.push('images/ folder')
      throw new Error(`Validation failed: Missing required MIP files (${missing.join(', ')}).`)
    }

    onProgress('Reading manifest...', 10)
    const manifest: MipManifest = JSON.parse(await manifestFile.async('string'))
    if (manifest.schemaVersion !== '1.0') {
      throw new Error(`Unsupported MIP schemaVersion "${manifest.schemaVersion}". Required: "1.0".`)
    }

    // Read & encode all assets as base64 data URLs
    onProgress('Reading assets...', 20)
    const assetsRaw = JSON.parse(await assetsFile.async('string'))
    const assetsList = this.parseAssetsList(assetsRaw)

    const assetLookup = new Map<string, { dataURL: string; width: number; height: number; mime: string }>()

    for (let i = 0; i < assetsList.length; i++) {
      const asset = assetsList[i]
      onProgress(`Encoding asset ${i + 1} of ${assetsList.length}...`, 20 + Math.round((i / assetsList.length) * 35))

      const imageZipEntry = this.findZipFile(zip, asset.file)
      if (!imageZipEntry) throw new Error(`Asset file missing in package: "${asset.file}" (ID: ${asset.id})`)

      const mimeType = asset.mime || 'image/png'
      const imageBlob = new Blob([await imageZipEntry.async('blob')], { type: mimeType })

      if (asset.sha256) {
        const computedSha = await this.computeSha256(imageBlob)
        if (computedSha.toLowerCase() !== asset.sha256.toLowerCase()) {
          console.warn(`Checksum mismatch for asset ${asset.id}`)
        }
      }

      // Convert to base64 data URL
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to encode asset'))
        reader.readAsDataURL(imageBlob)
      })

      assetLookup.set(asset.id, { dataURL, width: asset.width, height: asset.height, mime: mimeType })
    }

    // Read board layout
    onProgress('Reading board layout...', 60)
    const objectsList = this.parseObjectsList(JSON.parse(await boardFile.async('string')))
    const sortedObjects = [...objectsList].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))

    // Build Excalidraw scene
    onProgress('Reconstructing canvas shapes...', 80)
    const allElements: any[] = []
    const allFiles: Record<string, any> = {}
    let fallbackY = 0

    for (const obj of sortedObjects) {
      const resolved = this.resolveAsset(assetLookup, obj.assetId, assetsList)
      if (!resolved) throw new Error(`Asset ID "${obj.assetId}" referenced by object "${obj.id}" not found.`)

      const width = obj.bounds?.width ?? resolved.width
      const height = obj.bounds?.height ?? resolved.height
      const angle = ((obj.rotation ?? 0) * Math.PI) / 180

      let x = 0, y = 0
      if (obj.bounds?.x != null && obj.bounds?.y != null) {
        x = obj.bounds.x
        y = obj.bounds.y
      } else {
        y = fallbackY
        fallbackY += height + 100
      }

      const scene = buildImageScene(resolved.dataURL, resolved.mime, width, height, x, y, angle)
      allElements.push(...scene.elements)
      Object.assign(allFiles, scene.files)
    }

    // Read diagnostics (non-blocking)
    if (diagnosticsFile) {
      try {
        const diagnostics = JSON.parse(await diagnosticsFile.async('string'))
        if (diagnostics.warnings?.length) console.warn('MIP Diagnostics:', diagnostics.warnings)
      } catch { /* non-critical */ }
    }

    onProgress('Board assembly complete!', 98)

    return {
      elements: allElements,
      appState: { viewBackgroundColor: '#ffffff' },
      files: allFiles,
    }
  }
}
