import { Importer, ImportAnalysis, ImportLog } from './Importer'
import type { ExcalidrawScene } from '../../types'
import { Board } from '../../types'
import { BoardRepository } from '../../storage/BoardRepository'
import { ImageImporter } from './importers/ImageImporter'
import { SVGImporter } from './importers/SVGImporter'
import { PDFImporter } from './importers/PDFImporter'
import { HtmlImporter } from './html/HtmlImporter'
import { MipImporter } from './importers/MipImporter'

export class ImportManager {
  private static importers: Importer[] = [
    new MipImporter(),   // MIP v1.0 ZIP package — most specific, check first
    new HtmlImporter(),  // HTML exports
    new ImageImporter(),
    new SVGImporter(),
    new PDFImporter(),
  ]

  public static registerImporter(importer: Importer): void {
    const exists = this.importers.some((i) => i.name === importer.name)
    if (!exists) {
      this.importers.unshift(importer)
    }
  }

  public static getImporter(file: File): Importer | null {
    return this.importers.find((i) => i.supports(file)) || null
  }

  public static async analyzeFile(file: File): Promise<ImportAnalysis> {
    const importer = this.getImporter(file)
    if (!importer) {
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        isValid: false,
        error: 'Unsupported file format. Supported: MIP Package (.zip), HTML, PNG, JPEG, SVG, PDF.',
      }
    }
    try {
      return await importer.analyze(file)
    } catch (e: any) {
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        isValid: false,
        error: `Analysis failed: ${e.message}`,
      }
    }
  }

  public static async importFile(
    file: File,
    onProgress: (phase: string, percent: number) => void,
    repository: BoardRepository
  ): Promise<Board> {
    const startTime = Date.now()
    const importer = this.getImporter(file)
    if (!importer) {
      throw new Error(`Unsupported file type: ${file.name}`)
    }

    const boardId = crypto.randomUUID()

    try {
      onProgress('Preparing Workspace...', 5)

      // Importers now return ExcalidrawScene directly — no storage wrapper needed
      const scene: ExcalidrawScene = await importer.import(file, (phase, pct) => {
        onProgress(phase, 10 + pct * 0.8)
      })

      onProgress('Generating Whiteboard...', 92)

      const now = new Date().toISOString()
      const title = file.name.substring(0, file.name.lastIndexOf('.')) || file.name

      const importedBoard: Board = {
        id: boardId,
        title,
        createdAt: now,
        updatedAt: now,
        elements: scene,
        metadata: {
          description: `Imported from ${file.name} (${importer.name})`,
          tags: ['imported', importer.name.toLowerCase()],
        },
      }

      onProgress('Saving to Storage...', 95)
      await repository.save(importedBoard)

      onProgress('Completed', 100)

      this.logImport({
        id: crypto.randomUUID(),
        importDate: now,
        originalFileName: file.name,
        importType: importer.name,
        boardId,
        assetsCount: Object.keys(scene.files ?? {}).length,
        durationMs: Date.now() - startTime,
        status: 'success',
      })

      return importedBoard
    } catch (e: any) {
      const errorMsg = e.message || 'Import failed midway.'
      this.logImport({
        id: crypto.randomUUID(),
        importDate: new Date().toISOString(),
        originalFileName: file.name,
        importType: importer.name,
        boardId: '',
        assetsCount: 0,
        durationMs: Date.now() - startTime,
        status: 'failed',
        error: errorMsg,
      })
      throw e
    }
  }

  private static logImport(entry: ImportLog): void {
    const logsStr = localStorage.getItem('whiteboard_import_logs')
    let logs: ImportLog[] = []
    if (logsStr) {
      try { logs = JSON.parse(logsStr) } catch { logs = [] }
    }
    logs.unshift(entry)
    localStorage.setItem('whiteboard_import_logs', JSON.stringify(logs))
  }

  public static getImportLogs(): ImportLog[] {
    const logsStr = localStorage.getItem('whiteboard_import_logs')
    if (!logsStr) return []
    try { return JSON.parse(logsStr) } catch { return [] }
  }
}
