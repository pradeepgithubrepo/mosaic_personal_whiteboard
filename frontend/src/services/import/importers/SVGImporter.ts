import { Importer, ImportAnalysis } from '../Importer'
import type { ExcalidrawScene } from '../../../types'
import { fileToDataURL, buildImageScene } from './ImageImporter'

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
    onProgress: (phase: string, percent: number) => void
  ): Promise<ExcalidrawScene> {
    onProgress('Parsing SVG geometry...', 20)
    const dims = await this.parseSvgDimensions(file)

    onProgress('Encoding SVG as base64...', 60)
    const dataURL = await fileToDataURL(file)

    onProgress('Constructing canvas layout...', 90)
    // SVGs render best as image/svg+xml; Excalidraw supports them natively
    return buildImageScene(dataURL, 'image/svg+xml', dims.width, dims.height)
  }
}
