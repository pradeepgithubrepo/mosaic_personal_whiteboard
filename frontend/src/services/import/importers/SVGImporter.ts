import { Importer, ImportAnalysis } from '../Importer'
import { StorageProvider } from '../../../types'
import { ImportResult, ImportedAsset, ImportedShape } from './ImageImporter'

export class SVGImporter implements Importer {
  public name = 'SVG Importer'
  public supportedMimeTypes = ['image/svg+xml']

  public supports(file: File): boolean {
    return this.supportedMimeTypes.includes(file.type) || file.name.endsWith('.svg')
  }

  private async parseSvgDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = reader.result as string
          const parser = new DOMParser()
          const doc = parser.parseFromString(text, 'image/svg+xml')
          const svgEl = doc.querySelector('svg')
          let width = 800, height = 600

          if (svgEl) {
            const wAttr = svgEl.getAttribute('width')
            const hAttr = svgEl.getAttribute('height')
            const vbAttr = svgEl.getAttribute('viewBox')
            if (wAttr && hAttr) {
              width = parseFloat(wAttr)
              height = parseFloat(hAttr)
            } else if (vbAttr) {
              const parts = vbAttr.split(/\s+/)
              if (parts.length === 4) {
                width = parseFloat(parts[2])
                height = parseFloat(parts[3])
              }
            }
          }
          resolve({ width, height })
        } catch {
          resolve({ width: 800, height: 600 })
        }
      }
      reader.onerror = () => resolve({ width: 800, height: 600 })
      reader.readAsText(file)
    })
  }

  public async analyze(file: File): Promise<ImportAnalysis> {
    const dims = await this.parseSvgDimensions(file)
    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: 'image/svg+xml',
      estimatedBoardSize: dims,
      estimatedUploadSize: file.size,
      isValid: true,
    }
  }

  public async import(
    file: File,
    onProgress: (phase: string, percent: number) => void,
    storage: StorageProvider
  ): Promise<ImportResult> {
    onProgress('Parsing SVG geometry...', 20)
    const dims = await this.parseSvgDimensions(file)

    onProgress('Uploading SVG to workspace...', 50)
    const assetId = await storage.uploadAsset(file.name, 'image/svg+xml', file)

    onProgress('Building blob URL for rendering...', 75)
    const downloadedBlob = await storage.downloadAsset(assetId)
    const src = URL.createObjectURL(downloadedBlob)

    onProgress('Constructing canvas layout...', 90)

    const importedAssets: ImportedAsset[] = [
      { assetId, src, fileName: file.name, mimeType: 'image/svg+xml', width: dims.width, height: dims.height },
    ]

    const importedShapes: ImportedShape[] = [
      { assetId, x: 0, y: 0, width: dims.width, height: dims.height },
    ]

    return { _importResult: true, importedAssets, importedShapes }
  }
}
