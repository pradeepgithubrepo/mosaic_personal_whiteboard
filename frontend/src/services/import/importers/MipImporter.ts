import JSZip from 'jszip'
import { Importer, ImportAnalysis } from '../Importer'
import { StorageProvider } from '../../../types'
import { ImportResult, ImportedAsset, ImportedShape } from './ImageImporter'

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

  // Find a file entry in the JSZip instance flexibly
  private findZipFile(zip: JSZip, targetPath: string): JSZip.JSZipObject | null {
    // Exact match first
    if (zip.file(targetPath)) return zip.file(targetPath)!
    
    // Normalize path separators
    const normalized = targetPath.replace(/\\/g, '/')
    if (zip.file(normalized)) return zip.file(normalized)!

    // Match filename suffix
    const basename = normalized.split('/').pop()
    for (const relativePath of Object.keys(zip.files)) {
      if (relativePath.endsWith(basename!)) {
        return zip.file(relativePath)!
      }
    }
    return null
  }

  // Helper to compute SHA-256 checksum of a Blob
  private async computeSha256(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Flexible parser for assets.json (supports Array, Object with .assets array, or Object dictionary)
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

    if (Array.isArray(assetsRaw.assets)) {
      return this.parseAssetsList(assetsRaw.assets)
    }
    if (Array.isArray(assetsRaw.items)) {
      return this.parseAssetsList(assetsRaw.items)
    }

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

  // Flexible parser for board.json (supports Array, Object with .objects array, or Object dictionary)
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
            bounds: v.bounds || {
              x: v.x ?? null,
              y: v.y ?? null,
              width: v.width || v.w || 0,
              height: v.height || v.h || 0,
            },
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

  // Multi-tier fallback asset resolver to match assetId references robustly
  private resolveAssetFromLookup(
    assetLookup: Map<string, { assetId: string; src: string; width: number; height: number; mime: string; fileName?: string }>,
    targetId: string,
    assetsList: MipAssetEntry[]
  ): { assetId: string; src: string; width: number; height: number; mime: string; fileName?: string } | null {
    if (!targetId) return null

    // Tier 1: Direct exact match
    if (assetLookup.has(targetId)) {
      return assetLookup.get(targetId)!
    }

    // Tier 2: Case-insensitive / trimmed match
    const lowerTarget = String(targetId).toLowerCase().trim()
    for (const [k, val] of assetLookup.entries()) {
      if (k.toLowerCase().trim() === lowerTarget) {
        return val
      }
    }

    // Tier 3: Stripped numeric ID match (e.g., targetId "asset-0000" vs key "0000" or "0")
    const numTarget = lowerTarget.replace(/[^0-9]/g, '')
    if (numTarget) {
      for (const [k, val] of assetLookup.entries()) {
        const numK = k.toLowerCase().replace(/[^0-9]/g, '')
        if (numK && (numTarget === numK || parseInt(numTarget, 10) === parseInt(numK, 10))) {
          return val
        }
      }
    }

    // Tier 4: Filename match
    for (const [, val] of assetLookup.entries()) {
      if (val.fileName && lowerTarget.includes(val.fileName.toLowerCase())) {
        return val
      }
    }

    // Tier 5: Index-based fallback (e.g. targetId asset-0000 -> index 0 in assetsList)
    if (numTarget) {
      const idx = parseInt(numTarget, 10)
      if (!isNaN(idx) && idx >= 0 && idx < assetsList.length) {
        const entry = assetsList[idx]
        if (entry && assetLookup.has(entry.id)) {
          return assetLookup.get(entry.id)!
        }
      }
    }

    // Tier 6: Single-entry fallback if total assets === 1
    if (assetLookup.size === 1) {
      return assetLookup.values().next().value!
    }

    return null
  }

  public async analyze(file: File): Promise<ImportAnalysis> {
    try {
      const zip = await JSZip.loadAsync(file)

      // Step 1: Validate Package Files
      const manifestFile = this.findZipFile(zip, 'manifest.json')
      const boardFile = this.findZipFile(zip, 'board.json')
      const assetsFile = this.findZipFile(zip, 'assets.json')
      const diagnosticsFile = this.findZipFile(zip, 'diagnostics.json')

      // Check for images directory or image files
      const hasImagesFolder = Object.keys(zip.files).some((f) => f.startsWith('images/') || f.includes('/images/'))

      if (!manifestFile || !boardFile || !assetsFile || !diagnosticsFile || !hasImagesFolder) {
        const missing: string[] = []
        if (!manifestFile) missing.push('manifest.json')
        if (!boardFile) missing.push('board.json')
        if (!assetsFile) missing.push('assets.json')
        if (!diagnosticsFile) missing.push('diagnostics.json')
        if (!hasImagesFolder) missing.push('images/ folder')

        return {
          fileName: file.name,
          fileSize: file.size,
          mimeType: 'application/zip',
          isValid: false,
          error: `Invalid MIP v1.0 package. Missing required files: ${missing.join(', ')}.`,
        }
      }

      // Step 2: Read manifest.json
      const manifestStr = await manifestFile.async('string')
      const manifest: MipManifest = JSON.parse(manifestStr)

      if (manifest.schemaVersion !== '1.0') {
        return {
          fileName: file.name,
          fileSize: file.size,
          mimeType: 'application/zip',
          isValid: false,
          error: `Unsupported MIP schemaVersion "${manifest.schemaVersion}". Importer requires version 1.0.`,
        }
      }

      // Read objects count
      const boardStr = await boardFile.async('string')
      const boardRaw = JSON.parse(boardStr)
      const objects = this.parseObjectsList(boardRaw)

      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/zip',
        pagesCount: objects.length,
        estimatedBoardSize: { width: 1920, height: Math.max(1080, objects.length * 600) },
        estimatedUploadSize: file.size,
        isValid: true,
      }
    } catch (e: any) {
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/zip',
        isValid: false,
        error: e.message || 'Corrupted or unreadable ZIP archive.',
      }
    }
  }

  public async import(
    file: File,
    onProgress: (phase: string, percent: number) => void,
    storage: StorageProvider
  ): Promise<ImportResult> {
    onProgress('Step 1: Opening & Validating MIP Package...', 5)
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

    // Step 2: Read manifest.json
    onProgress('Step 2: Reading manifest.json...', 10)
    const manifestStr = await manifestFile.async('string')
    const manifest: MipManifest = JSON.parse(manifestStr)

    if (manifest.schemaVersion !== '1.0') {
      throw new Error(`Unsupported MIP schemaVersion "${manifest.schemaVersion}". Required: "1.0".`)
    }

    // Step 3: Read assets.json & Upload Images
    onProgress('Step 3: Reading assets & verifying checksums...', 20)
    const assetsStr = await assetsFile.async('string')
    const assetsRaw = JSON.parse(assetsStr)
    const assetsList = this.parseAssetsList(assetsRaw)

    const assetLookup = new Map<string, { assetId: string; src: string; width: number; height: number; mime: string; fileName?: string }>()
    const importedAssets: ImportedAsset[] = []

    for (let i = 0; i < assetsList.length; i++) {
      const asset = assetsList[i]
      const stepPct = 20 + Math.round((i / assetsList.length) * 35)
      onProgress(`Uploading asset ${i + 1} of ${assetsList.length} (${asset.id})...`, stepPct)

      const imageZipEntry = this.findZipFile(zip, asset.file)
      if (!imageZipEntry) {
        throw new Error(`Asset file missing in package: "${asset.file}" (ID: ${asset.id})`)
      }

      const mimeType = asset.mime || 'image/png'
      const imageBlob = await imageZipEntry.async('blob')
      const blobWithMime = new Blob([imageBlob], { type: mimeType })

      // Verify SHA-256 checksum if present
      if (asset.sha256) {
        const computedSha = await this.computeSha256(blobWithMime)
        if (computedSha.toLowerCase() !== asset.sha256.toLowerCase()) {
          console.warn(`Checksum mismatch for asset ${asset.id}: expected ${asset.sha256}, got ${computedSha}`)
        }
      }

      const fileName = asset.file.split('/').pop() || `${asset.id}.png`
      const assetId = await storage.uploadAsset(fileName, mimeType, blobWithMime)

      const downloadedBlob = await storage.downloadAsset(assetId)
      const src = URL.createObjectURL(downloadedBlob)

      const lookupRecord = {
        assetId,
        src,
        width: asset.width,
        height: asset.height,
        mime: mimeType,
        fileName,
      }

      assetLookup.set(asset.id, lookupRecord)

      importedAssets.push({
        assetId,
        src,
        fileName,
        mimeType,
        width: asset.width,
        height: asset.height,
      })
    }

    // Step 4: Read board.json
    onProgress('Step 4: Reading board layout...', 60)
    const boardStr = await boardFile.async('string')
    const boardRaw = JSON.parse(boardStr)
    const objectsList = this.parseObjectsList(boardRaw)

    // Step 8: Layer Order Sorting (Ascending)
    onProgress('Step 8: Sorting objects by layer...', 70)
    const sortedObjects = [...objectsList].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))

    // Step 5-13: Resolve Assets, Construct Shapes, Apply Position / Fallback / Rotation / Meta
    onProgress('Step 6-13: Reconstructing TLDraw shapes...', 80)
    const importedShapes: ImportedShape[] = []
    let fallbackY = 0

    for (const obj of sortedObjects) {
      // Step 5: Resolve Asset using multi-tier lookup
      const resolvedAsset = this.resolveAssetFromLookup(assetLookup, obj.assetId, assetsList)
      if (!resolvedAsset) {
        throw new Error(`Asset ID "${obj.assetId}" referenced by object "${obj.id}" not found in assetLookup.`)
      }

      // Step 10: Width & Height
      const width = obj.bounds?.width ?? resolvedAsset.width
      const height = obj.bounds?.height ?? resolvedAsset.height

      // Step 9: Rotation
      const rotation = obj.rotation ?? 0

      // Step 7: Position resolution
      let x = 0
      let y = 0

      if (
        obj.bounds &&
        obj.bounds.x !== null &&
        obj.bounds.x !== undefined &&
        obj.bounds.y !== null &&
        obj.bounds.y !== undefined
      ) {
        x = obj.bounds.x
        y = obj.bounds.y
      } else {
        // Fallback vertical stack positioning (Step 7)
        x = 0
        y = fallbackY
        fallbackY += height + 100 // 100px gap
      }

      // Step 11-13: Metadata (style, parent, domIndex)
      const meta: Record<string, any> = {
        originalId: obj.id,
        originalStyle: obj.style || '',
        parent: obj.parent || 'div',
        domIndex: obj.domIndex ?? 0,
        layer: obj.layer ?? 0,
      }

      importedShapes.push({
        assetId: resolvedAsset.assetId,
        x,
        y,
        width,
        height,
        rotation,
        meta,
      })
    }

    // Step 14: Diagnostics
    if (diagnosticsFile) {
      try {
        const diagStr = await diagnosticsFile.async('string')
        const diagnostics = JSON.parse(diagStr)
        if (diagnostics.warnings && Array.isArray(diagnostics.warnings)) {
          console.warn('MIP Import Diagnostics Warnings:', diagnostics.warnings)
        }
      } catch {
        // Diagnostics read error non-blocking
      }
    }

    onProgress('Step 15: Board Assembly Completed', 98)

    return {
      _importResult: true,
      importedAssets,
      importedShapes,
    }
  }
}
