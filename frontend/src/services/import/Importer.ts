import { StorageProvider } from '../../types'

export interface ImportAnalysis {
  fileName: string
  fileSize: number
  mimeType: string
  estimatedBoardSize?: { width: number; height: number }
  estimatedUploadSize?: number
  pagesCount?: number // Only for PDFs
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
  import(
    file: File,
    onProgress: (phase: string, percent: number) => void,
    storage: StorageProvider
  ): Promise<any> // Returns elements record mapping for tldraw snapshot
}
