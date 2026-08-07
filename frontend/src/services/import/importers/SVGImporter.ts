import { Importer, ImportAnalysis } from '../Importer'
import type { ExcalidrawScene } from '../../../types'
import { buildImageScene } from './ImageImporter'

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
    onProgress('Reading SVG file...', 10)
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read SVG file.'))
      reader.readAsText(file)
    })

    onProgress('Parsing SVG DOM...', 30)
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'image/svg+xml')
    const svgEl = doc.querySelector('svg')

    // Parse dimensions and viewBox
    let width = 800
    let height = 600
    let minX = 0
    let minY = 0
    let viewBoxWidth = 800
    let viewBoxHeight = 600
    let hasViewBox = false

    if (svgEl) {
      const wAttr = svgEl.getAttribute('width')
      const hAttr = svgEl.getAttribute('height')
      const vbAttr = svgEl.getAttribute('viewBox')

      if (wAttr && hAttr) {
        width = parseFloat(wAttr)
        height = parseFloat(hAttr)
      }
      if (vbAttr) {
        const parts = vbAttr.split(/\s+/).map(Number)
        if (parts.length === 4 && !parts.some(isNaN)) {
          minX = parts[0]
          minY = parts[1]
          viewBoxWidth = parts[2]
          viewBoxHeight = parts[3]
          hasViewBox = true
          if (!wAttr || !hAttr) {
            width = viewBoxWidth
            height = viewBoxHeight
          }
        }
      }
    }

    const scaleX = hasViewBox ? width / viewBoxWidth : 1
    const scaleY = hasViewBox ? height / viewBoxHeight : 1

    const images = doc.querySelectorAll('image')
    const extractedElements: any[] = []
    const extractedFiles: Record<string, any> = {}

    if (images.length > 0) {
      onProgress(`Extracting ${images.length} embedded image(s)...`, 50)
      for (const img of Array.from(images)) {
        const href = img.getAttribute('href') || img.getAttribute('xlink:href')
        if (!href) continue

        const imgX = parseFloat(img.getAttribute('x') || '0')
        const imgY = parseFloat(img.getAttribute('y') || '0')
        const imgW = parseFloat(img.getAttribute('width') || '0')
        const imgH = parseFloat(img.getAttribute('height') || '0')

        // Remove nested image element from parent SVG to prevent duplicate rendering
        img.remove()

        // Place on canvas (relative to parent coordinate system)
        const posX = (imgX - minX) * scaleX
        const posY = (imgY - minY) * scaleY
        const targetW = imgW * scaleX
        const targetH = imgH * scaleY

        const mime = href.startsWith('data:')
          ? (href.match(/^data:([^;]+);/)?.[1] ?? 'image/png')
          : 'image/png'

        // Build individual Excalidraw element (unlocked)
        const scene = buildImageScene(href, mime, targetW, targetH, posX, posY, 0, false)
        extractedElements.push(...scene.elements)
        Object.assign(extractedFiles, scene.files)
      }
    }

    // Check if there are visual elements remaining in the parent SVG
    let cleanedDataURL = ''
    let hasVisualContent = false
    if (svgEl) {
      const visualSelectors = 'path, rect, circle, ellipse, line, polyline, polygon, text, g'
      const visualElements = svgEl.querySelectorAll(visualSelectors)

      for (const el of Array.from(visualElements)) {
        if (el.tagName.toLowerCase() === 'g') {
          const children = el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text')
          if (children.length > 0) {
            hasVisualContent = true
            break
          }
        } else {
          hasVisualContent = true
          break
        }
      }

      if (hasVisualContent) {
        onProgress('Serializing remaining vector shapes...', 75)
        const serializer = new XMLSerializer()
        const cleanedSvgString = serializer.serializeToString(doc)
        cleanedDataURL = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(cleanedSvgString)))
      }
    }

    onProgress('Constructing canvas layout...', 90)
    const allElements: any[] = []
    const allFiles: Record<string, any> = {}

    if (hasVisualContent && cleanedDataURL) {
      // SVGs render best as image/svg+xml; Excalidraw supports them natively (unlocked by default)
      const scene = buildImageScene(cleanedDataURL, 'image/svg+xml', width, height, 0, 0, 0, false)
      allElements.push(...scene.elements)
      Object.assign(allFiles, scene.files)
    }

    allElements.push(...extractedElements)
    Object.assign(allFiles, extractedFiles)

    return {
      elements: allElements,
      appState: { viewBackgroundColor: '#ffffff' },
      files: allFiles,
    }
  }
}
