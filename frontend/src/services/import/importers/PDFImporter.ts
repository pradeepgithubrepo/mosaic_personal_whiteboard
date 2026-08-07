import * as pdfjsLib from 'pdfjs-dist'
import { Importer, ImportAnalysis } from '../Importer'
import type { ExcalidrawScene } from '../../../types'
import { buildImageScene } from './ImageImporter'

// PDF.js worker — served from unpkg matching installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

const PAGE_SPACING = 50  // vertical gap between pages in canvas units
const RENDER_SCALE = 1.5 // render at 1.5× for sharp output

/** Render a canvas element to a base64 PNG data URL */
function canvasToDataURL(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas.toBlob returned null'))
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read canvas blob'))
      reader.readAsDataURL(blob)
    }, 'image/png')
  })
}

export class PDFImporter implements Importer {
  public name = 'PDF Importer'
  public supportedMimeTypes = ['application/pdf']

  public supports(file: File): boolean {
    return this.supportedMimeTypes.includes(file.type) || file.name.endsWith('.pdf')
  }

  public async analyze(file: File): Promise<ImportAnalysis> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const pagesCount = pdf.numPages

      let pageWidth = 800, pageHeight = 1100
      if (pagesCount > 0) {
        const viewport = (await pdf.getPage(1)).getViewport({ scale: RENDER_SCALE })
        pageWidth = viewport.width
        pageHeight = viewport.height
      }

      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/pdf',
        pagesCount,
        estimatedBoardSize: {
          width: pageWidth,
          height: pagesCount * pageHeight + (pagesCount - 1) * PAGE_SPACING,
        },
        estimatedUploadSize: file.size * 1.5,
        isValid: true,
      }
    } catch (e: any) {
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/pdf',
        isValid: false,
        error: e.message || 'Corrupted or password-protected PDF.',
      }
    }
  }

  public async import(
    file: File,
    onProgress: (phase: string, percent: number) => void
  ): Promise<ExcalidrawScene> {
    onProgress('Loading PDF document...', 5)
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pagesCount = pdf.numPages

    onProgress(`Found ${pagesCount} pages. Rendering...`, 10)

    // Collect all page scenes then merge them into one
    const allElements: any[] = []
    const allFiles: Record<string, any> = {}

    let currentY = 0
    let maxWidth = 0

    // First pass — render all pages and collect widths
    const pageData: Array<{ dataURL: string; width: number; height: number }> = []
    for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
      const pct = Math.round(10 + ((pageNum - 1) / pagesCount) * 60)
      onProgress(`Rendering page ${pageNum} of ${pagesCount}...`, pct)

      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      maxWidth = Math.max(maxWidth, viewport.width)

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport, canvas }).promise

      const dataURL = await canvasToDataURL(canvas)
      pageData.push({ dataURL, width: viewport.width, height: viewport.height })
    }

    // Second pass — build Excalidraw elements, centering each page horizontally
    onProgress('Composing canvas...', 80)
    for (const { dataURL, width, height } of pageData) {
      const x = (maxWidth - width) / 2  // centre narrower pages
      const scene = buildImageScene(dataURL, 'image/png', width, height, x, currentY)
      allElements.push(...scene.elements)
      Object.assign(allFiles, scene.files)
      currentY += height + PAGE_SPACING
    }

    onProgress('Done — building board...', 95)

    return {
      elements: allElements,
      appState: { viewBackgroundColor: '#ffffff' },
      files: allFiles,
    }
  }
}
