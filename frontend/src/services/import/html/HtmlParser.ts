/**
 * HtmlParser.ts
 * Parses raw HTML text using the browser's DOMParser and returns the
 * document, page title, and high-level metadata.
 * No rendering occurs — the document is used purely as a data source.
 */

export interface ParsedDocument {
  doc: Document
  title: string
  /** Approximate canvas bounds extracted from body / container styles */
  canvasWidth: number
  canvasHeight: number
}

/** Parse a CSS length value and return a number (px assumed) */
function cssPx(value: string | null | undefined): number {
  if (!value) return 0
  return parseFloat(value) || 0
}

export function parseHtml(html: string, fileName: string): ParsedDocument {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    fileName.replace(/\.html?$/i, '') ||
    'Imported Whiteboard'

  // Try to determine canvas bounds from the outermost container
  const body = doc.body
  const candidates = [
    body.querySelector('[class*="canvas" i]'),
    body.querySelector('[class*="whiteboard" i]'),
    body.querySelector('[class*="board" i]'),
    body.querySelector('main'),
    body,
  ]

  let canvasWidth = 0
  let canvasHeight = 0

  for (const el of candidates) {
    if (!el) continue
    const s = (el as HTMLElement).style
    const w = cssPx(s?.width) || cssPx(el.getAttribute?.('width'))
    const h = cssPx(s?.height) || cssPx(el.getAttribute?.('height'))
    if (w > 0 && h > 0) {
      canvasWidth = w
      canvasHeight = h
      break
    }
  }

  // If still unknown, scan all positioned children and derive from max bounds
  if (canvasWidth === 0 || canvasHeight === 0) {
    let maxRight = 0
    let maxBottom = 0
    doc.querySelectorAll<HTMLElement>('[style*="position"]').forEach((el) => {
      const left = cssPx(el.style.left)
      const top = cssPx(el.style.top)
      const w = cssPx(el.style.width) || el.offsetWidth
      const h = cssPx(el.style.height) || el.offsetHeight
      maxRight = Math.max(maxRight, left + w)
      maxBottom = Math.max(maxBottom, top + h)
    })
    canvasWidth = maxRight || 1920
    canvasHeight = maxBottom || 1080
  }

  return { doc, title, canvasWidth, canvasHeight }
}
