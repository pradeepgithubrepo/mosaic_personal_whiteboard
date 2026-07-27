import { Importer, ImportAnalysis } from '../Importer'
import { StorageProvider } from '../../../types'

export interface ImportedAsset {
  assetId: string      // the storage asset ID (for asset-id:// references)
  src: string          // resolved blob URL (for immediate rendering)
  fileName: string
  mimeType: string
  width: number
  height: number
}

export interface ImportedShape {
  assetId: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  meta?: Record<string, any>
}

export interface ImportResult {
  _importResult: true
  importedAssets: ImportedAsset[]
  importedShapes: ImportedShape[]
}

export class ImageImporter implements Importer {
  public name = 'Image Importer'
  public supportedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg']

  public supports(file: File): boolean {
    return this.supportedMimeTypes.includes(file.type)
  }

  private async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      img.src = objectUrl
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
        URL.revokeObjectURL(objectUrl)
      }
      img.onerror = () => {
        reject(new Error('Failed to decode image dimensions.'))
        URL.revokeObjectURL(objectUrl)
      }
    })
  }

  public async analyze(file: File): Promise<ImportAnalysis> {
    try {
      const dims = await this.getImageDimensions(file)
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        estimatedBoardSize: dims,
        estimatedUploadSize: file.size,
        isValid: true,
      }
    } catch (e: any) {
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        isValid: false,
        error: e.message || 'Corrupted or unreadable image file.',
      }
    }
  }

  public async import(
    file: File,
    onProgress: (phase: string, percent: number) => void,
    storage: StorageProvider
  ): Promise<ImportResult> {
    onProgress('Analyzing image dimensions...', 20)
    const dims = await this.getImageDimensions(file)

    onProgress('Uploading image to workspace...', 40)
    const assetId = await storage.uploadAsset(file.name, file.type, file)

    onProgress('Building blob URL for rendering...', 70)
    const downloadedBlob = await storage.downloadAsset(assetId)
    const src = URL.createObjectURL(downloadedBlob)

    onProgress('Constructing canvas layout...', 90)

    // Center at origin; CanvasPage will zoomToFit after placing
    const importedAssets: ImportedAsset[] = [
      { assetId, src, fileName: file.name, mimeType: file.type, width: dims.width, height: dims.height },
    ]

    const importedShapes: ImportedShape[] = [
      { assetId, x: 0, y: 0, width: dims.width, height: dims.height },
    ]

    return { _importResult: true, importedAssets, importedShapes }
  }
}
