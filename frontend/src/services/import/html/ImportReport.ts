/**
 * ImportReport.ts
 * Accumulates log entries during an import run and produces a structured
 * summary that is appended to the existing import history log.
 */

export interface ReportEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

export interface ImportReport {
  startedAt: string
  completedAt?: string
  fileName: string
  imagesDetected: number
  svgsDetected: number
  duplicatesSkipped: number
  assetsUploaded: number
  uploadDurationMs: number
  totalDurationMs: number
  generatedBoardObjects: number
  errors: string[]
  entries: ReportEntry[]
}

export class ImportReporter {
  private report: ImportReport
  private uploadStart = 0

  constructor(fileName: string) {
    this.report = {
      startedAt: new Date().toISOString(),
      fileName,
      imagesDetected: 0,
      svgsDetected: 0,
      duplicatesSkipped: 0,
      assetsUploaded: 0,
      uploadDurationMs: 0,
      totalDurationMs: 0,
      generatedBoardObjects: 0,
      errors: [],
      entries: [],
    }
  }

  log(message: string) {
    this.report.entries.push({ level: 'info', message, timestamp: new Date().toISOString() })
  }
  warn(message: string) {
    this.report.entries.push({ level: 'warn', message, timestamp: new Date().toISOString() })
  }
  error(message: string) {
    this.report.entries.push({ level: 'error', message, timestamp: new Date().toISOString() })
    this.report.errors.push(message)
  }

  setImagesDetected(n: number) { this.report.imagesDetected = n }
  setSvgsDetected(n: number) { this.report.svgsDetected = n }
  incrementDuplicatesSkipped() { this.report.duplicatesSkipped++ }
  incrementAssetsUploaded() { this.report.assetsUploaded++ }
  setGeneratedBoardObjects(n: number) { this.report.generatedBoardObjects = n }

  startUploadTimer() { this.uploadStart = Date.now() }
  stopUploadTimer() { this.report.uploadDurationMs += Date.now() - this.uploadStart }

  finish(): ImportReport {
    this.report.completedAt = new Date().toISOString()
    this.report.totalDurationMs = Date.now() - new Date(this.report.startedAt).getTime()
    return this.report
  }

  getReport(): ImportReport { return this.report }
}
