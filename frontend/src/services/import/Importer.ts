import type { ExcalidrawScene } from '../../types'

export interface ImportAnalysis {
  fileName: string
  fileSize: number
  mimeType: string
  estimatedBoardSize?: { width: number; height: number }
  estimatedUploadSize?: number
  pagesCount?: number // Only for PDFs / multi-asset imports
  isValid: boolean
  error?: string
}

export interface ImportLog {
  id: string
  importDate: string
  originalFileName: string
  importType: string
  boardId: string
  assetsCount: number
  durationMs: number
  status: 'success' | 'failed'
  error?: string
}

export interface Importer {
  name: string
  supportedMimeTypes: string[]
  supports(file: File): boolean
  analyze(file: File): Promise<ImportAnalysis>
  /**
   * Convert a file into an ExcalidrawScene that can be saved directly as
   * board.elements. Images are embedded as base64 data URLs inside the
   * scene's `files` map — no separate Drive asset upload is required.
   */
  import(
    file: File,
    onProgress: (phase: string, percent: number) => void
  ): Promise<ExcalidrawScene>
}
