/**
 * HtmlImporter.ts
 * Orchestrates all sub-modules for Microsoft Whiteboard HTML exports:
 *   HtmlParser → ImportValidator → AssetExtractor → BoardBuilder → ExcalidrawScene
 */

import { Importer, ImportAnalysis } from '../Importer'
import type { ExcalidrawScene } from '../../../types'
import { parseHtml } from './HtmlParser'
import { validateWhiteboardHtml } from './ImportValidator'
import { extractAssets } from './AssetExtractor'
import { buildBoard } from './BoardBuilder'
import { ImportReporter } from './ImportReport'

export class HtmlImporter implements Importer {
  public name = 'HTML Importer'
  public supportedMimeTypes = ['text/html', 'application/xhtml+xml']

  public supports(file: File): boolean {
    return (
      this.supportedMimeTypes.includes(file.type) ||
      file.name.endsWith('.html') ||
      file.name.endsWith('.htm')
    )
  }

  private async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read HTML file.'))
      reader.readAsText(file, 'utf-8')
    })
  }

  public async analyze(file: File): Promise<ImportAnalysis> {
    try {
      const html = await this.readFile(file)
      const { doc, canvasWidth, canvasHeight } = parseHtml(html, file.name)
      const validation = validateWhiteboardHtml(doc, file.name)

      if (!validation.valid) {
        return { fileName: file.name, fileSize: file.size, mimeType: file.type || 'text/html', isValid: false, error: validation.reason }
      }

      const assets = extractAssets(doc)
      const imageCount = assets.filter((a) => a.kind === 'image').length
      const svgCount = assets.filter((a) => a.kind === 'svg').length

      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'text/html',
        estimatedBoardSize: { width: canvasWidth, height: canvasHeight },
        estimatedUploadSize: Math.round(file.size * 0.6),
        pagesCount: imageCount + svgCount,
        isValid: true,
      }
    } catch (e: any) {
      return { fileName: file.name, fileSize: file.size, mimeType: file.type || 'text/html', isValid: false, error: e.message || 'Failed to analyse HTML file.' }
    }
  }

  public async import(
    file: File,
    onProgress: (phase: string, percent: number) => void
  ): Promise<ExcalidrawScene> {
    const reporter = new ImportReporter(file.name)

    onProgress('Reading HTML file...', 5)
    reporter.log(`Starting import of "${file.name}" (${file.size} bytes)`)

    const html = await this.readFile(file)

    onProgress('Parsing DOM...', 10)
    const { doc, title, canvasWidth, canvasHeight } = parseHtml(html, file.name)
    reporter.log(`Canvas bounds detected: ${canvasWidth} × ${canvasHeight}`)

    onProgress('Validating export...', 15)
    const validation = validateWhiteboardHtml(doc, file.name)
    if (!validation.valid) throw new Error(validation.reason || 'Invalid HTML export.')
    reporter.log(`Validation passed. Title: "${title}"`)

    onProgress('Extracting assets...', 20)
    const rawAssets = extractAssets(doc)
    const imageAssets = rawAssets.filter((a) => a.kind === 'image')
    const svgAssets = rawAssets.filter((a) => a.kind === 'svg')

    reporter.setImagesDetected(imageAssets.length)
    reporter.setSvgsDetected(svgAssets.length)
    reporter.log(`Detected ${imageAssets.length} images, ${svgAssets.length} SVGs`)

    if (rawAssets.length === 0) {
      throw new Error('No visual assets found in this HTML file. The whiteboard may be empty or use an unsupported format.')
    }

    onProgress(`Processing ${rawAssets.length} assets...`, 35)
    const scene = await buildBoard(rawAssets, { reporter, onProgress })

    const report = reporter.finish()
    reporter.log(
      `Import complete: ${report.assetsUploaded} encoded, ` +
        `${report.duplicatesSkipped} duplicates skipped, ` +
        `${report.generatedBoardObjects} board objects generated in ${report.totalDurationMs}ms`
    )

    try {
      sessionStorage.setItem('whiteboard_last_html_import_report', JSON.stringify(report))
    } catch { /* storage quota — not critical */ }

    return scene
  }
}
