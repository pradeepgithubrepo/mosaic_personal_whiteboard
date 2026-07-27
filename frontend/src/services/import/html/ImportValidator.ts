/**
 * ImportValidator.ts
 * Validates that a file is a well-formed Microsoft Whiteboard HTML export
 * before the rest of the pipeline runs.
 */

export interface ValidationResult {
  valid: boolean
  reason?: string
  title?: string
  pageCount?: number
}

export function validateWhiteboardHtml(doc: Document, fileName: string): ValidationResult {
  // Must have a body
  if (!doc.body) {
    return { valid: false, reason: 'HTML document has no body element.' }
  }

  // Microsoft Whiteboard HTML exports include either:
  //  • a <meta name="application-name" content="Microsoft Whiteboard"> tag
  //  • or a container div with class names like "Whiteboard" / "canvas-container"
  //  • or an <svg> / image payload typical of Whiteboard exports
  // We accept the file if any of these signals are present OR if it contains
  // meaningful image/SVG payloads (so hand-exported screenshots also work).
  const metaApp = doc.querySelector('meta[name="application-name"]')
  const metaGenerator = doc.querySelector('meta[name="generator"]')
  const appName =
    metaApp?.getAttribute('content') || metaGenerator?.getAttribute('content') || ''

  const isMicrosoftWhiteboard =
    /whiteboard/i.test(appName) ||
    doc.querySelector('[class*="whiteboard" i]') !== null ||
    doc.querySelector('[class*="canvas-container" i]') !== null ||
    doc.querySelector('[id*="whiteboard" i]') !== null

  const hasImages = doc.querySelectorAll('img').length > 0
  const hasSvg = doc.querySelectorAll('svg').length > 0

  if (!isMicrosoftWhiteboard && !hasImages && !hasSvg) {
    return {
      valid: false,
      reason:
        'This HTML file does not appear to be a Microsoft Whiteboard export. ' +
        'No whiteboard markers, images, or SVGs were found.',
    }
  }

  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    fileName.replace(/\.html?$/i, '') ||
    'Imported Whiteboard'

  return { valid: true, title }
}
