import { Importer, ImportAnalysis } from '../Importer'
import type { ExcalidrawScene } from '../../../types'

// ─── Shared helpers ────────────────────────────────────────────────────────

/** Read a File as a base64 data URL */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file as data URL.'))
    reader.readAsDataURL(file)
  })
}

/** Build one locked ExcalidrawImageElement + its BinaryFiles entry */
export function buildImageScene(
  dataURL: string,
  mimeType: string,
  width: number,
  height: number,
  x = 0,
  y = 0,
  angle = 0
): ExcalidrawScene {
  const fileId = crypto.randomUUID()
  const elementId = crypto.randomUUID()

  const element = {
    type: 'image' as const,
    id: elementId,
    x,
    y,
    width,
    height,
    angle,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid' as const,
    strokeWidth: 1,
    strokeStyle: 'solid' as const,
    roughness: 0,
    opacity: 100,
    groupIds: [] as string[],
    roundness: null,
    seed: Math.floor(Math.random() * 1e9),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: true,        // locked so users annotate on top rather than move it
    fileId,
    scale: [1, 1] as [number, number],
    status: 'saved' as const,
  }

  return {
    elements: [element],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {
      [fileId]: {
        mimeType,
        id: fileId,
        dataURL,
        created: Date.now(),
      },
    },
  }
}

// ─── ImageImporter ─────────────────────────────────────────────────────────

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
    onProgress: (phase: string, percent: number) => void
  ): Promise<ExcalidrawScene> {
    onProgress('Reading image dimensions...', 20)
    const dims = await this.getImageDimensions(file)

    onProgress('Encoding image as base64...', 60)
    const dataURL = await fileToDataURL(file)

    onProgress('Constructing canvas layout...', 90)
    return buildImageScene(dataURL, file.type, dims.width, dims.height)
  }
}
