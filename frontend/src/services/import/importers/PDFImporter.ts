import * as pdfjsLib from 'pdfjs-dist'
import { Importer, ImportAnalysis } from '../Importer'
import { StorageProvider } from '../../../types'
import { ImportResult, ImportedAsset, ImportedShape } from './ImageImporter'

// PDF.js worker — served from unpkg matching installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

const PAGE_SPACING = 50  // vertical gap between pages in canvas units
const RENDER_SCALE = 1.5 // render at 1.5× for sharp output

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
        estimatedBoardSize: { width: pageWidth, height: pagesCount * pageHeight + (pagesCount - 1) * PAGE_SPACING },
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
    onProgress: (phase: string, percent: number) => void,
    storage: StorageProvider
  ): Promise<ImportResult> {
    onProgress('Loading PDF document...', 5)
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pagesCount = pdf.numPages

    onProgress(`Found ${pagesCount} pages. Rendering...`, 10)

    const importedAssets: ImportedAsset[] = []
    const importedShapes: ImportedShape[] = []

    const baseName = file.name.replace(/\.pdf$/i, '')
    let currentY = 0
    let maxWidth = 0

    for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
      const pct = Math.round(10 + ((pageNum - 1) / pagesCount) * 70)
      onProgress(`Rendering page ${pageNum} of ${pagesCount}...`, pct)

      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: RENDER_SCALE })

      maxWidth = Math.max(maxWidth, viewport.width)

      // Render page onto an off-screen canvas
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport, canvas }).promise

      // Export canvas to PNG blob
      const pageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error(`Page ${pageNum}: canvas.toBlob returned null`))
        }, 'image/png')
      })

      onProgress(`Uploading page ${pageNum}...`, pct + 5)

      const pageFileName = `${baseName}_page_${pageNum}.png`
      const assetId = await storage.uploadAsset(pageFileName, 'image/png', pageBlob)

      // Get a blob URL for immediate rendering
      const downloadedBlob = await storage.downloadAsset(assetId)
      const src = URL.createObjectURL(downloadedBlob)

      importedAssets.push({
        assetId,
        src,
        fileName: pageFileName,
        mimeType: 'image/png',
        width: viewport.width,
        height: viewport.height,
      })

      importedShapes.push({
        assetId,
        x: 0,                // will be centred after all pages are known
        y: currentY,
        width: viewport.width,
        height: viewport.height,
      })

      currentY += viewport.height + PAGE_SPACING
    }

    onProgress('Centering pages horizontally...', 85)

    // Centre each page relative to the widest page
    for (const shape of importedShapes) {
      shape.x = (maxWidth - shape.width) / 2
    }

    onProgress('Done — building board...', 95)

    return { _importResult: true, importedAssets, importedShapes }
  }
}
