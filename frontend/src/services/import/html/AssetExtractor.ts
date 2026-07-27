/**
 * AssetExtractor.ts
 * Walks the parsed whiteboard DOM and extracts every image and SVG asset,
 * normalising them to a common RawAsset structure for upload.
 */

import { extractPosition, ElementPosition } from './PositionExtractor'

export type AssetKind = 'image' | 'svg'

export interface RawAsset {
  kind: AssetKind
  /** Data URL (base64) or absolute/relative URL */
  src: string
  mimeType: string
  fileName: string
  /** Dimensions may be 0 if unknown at extraction time */
  width: number
  height: number
  position: ElementPosition
  /** SHA-256 hex – populated after blob is available */
  checksum?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function guessMimeFromSrc(src: string): string {
  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);/)
    return match?.[1] ?? 'image/png'
  }
  if (/\.svg(\?|$)/i.test(src)) return 'image/svg+xml'
  if (/\.jpe?g(\?|$)/i.test(src)) return 'image/jpeg'
  if (/\.gif(\?|$)/i.test(src)) return 'image/gif'
  if (/\.webp(\?|$)/i.test(src)) return 'image/webp'
  return 'image/png'
}

function sanitiseFileName(src: string, index: number, mime: string): string {
  const ext = mime.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png'
  if (src.startsWith('data:')) return `asset_${index}.${ext}`
  try {
    const url = new URL(src, 'https://placeholder.invalid')
    const base = url.pathname.split('/').pop() || `asset_${index}.${ext}`
    return base
  } catch {
    return `asset_${index}.${ext}`
  }
}

function extractDimFromAttrOrStyle(el: HTMLElement, attr: 'width' | 'height'): number {
  const fromAttr = parseFloat(el.getAttribute(attr) || '0')
  if (fromAttr > 0) return fromAttr
  const fromStyle = parseFloat((el.style as any)[attr] || '0')
  return fromStyle > 0 ? fromStyle : 0
}

// ─── SVG serialiser ────────────────────────────────────────────────────────

function svgToDataUrl(svgEl: SVGElement): string {
  const serialiser = new XMLSerializer()
  const svgString = serialiser.serializeToString(svgEl)
  const encoded = btoa(unescape(encodeURIComponent(svgString)))
  return `data:image/svg+xml;base64,${encoded}`
}

// ─── Main extractor ────────────────────────────────────────────────────────

export function extractAssets(doc: Document): RawAsset[] {
  const assets: RawAsset[] = []
  let index = 0

  // 1. <img> elements
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.src || img.getAttribute('src') || ''
    if (!src) return

    const mime = guessMimeFromSrc(src)
    const width = extractDimFromAttrOrStyle(img, 'width') || img.naturalWidth || 0
    const height = extractDimFromAttrOrStyle(img, 'height') || img.naturalHeight || 0
    const position = extractPosition(img)

    assets.push({
      kind: 'image',
      src,
      mimeType: mime,
      fileName: sanitiseFileName(src, index++, mime),
      width,
      height,
      position,
    })
  })

  // 2. Inline background-image styles (Microsoft Whiteboard sometimes uses these)
  doc.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach((el) => {
    const match = el.style.backgroundImage?.match(/url\(['"]?([^'"]+)['"]?\)/)
    if (!match) return
    const src = match[1]
    const mime = guessMimeFromSrc(src)
    const position = extractPosition(el)

    assets.push({
      kind: 'image',
      src,
      mimeType: mime,
      fileName: sanitiseFileName(src, index++, mime),
      width: position.width,
      height: position.height,
      position,
    })
  })

  // 3. <svg> elements – serialise to a data URL
  doc.querySelectorAll('svg').forEach((svgEl) => {
    // Skip tiny / invisible SVGs (icon sprites etc.)
    const w = parseFloat(svgEl.getAttribute('width') || svgEl.style.width || '0')
    const h = parseFloat(svgEl.getAttribute('height') || svgEl.style.height || '0')
    if (w < 10 && h < 10) return

    const src = svgToDataUrl(svgEl as SVGElement)
    const position = extractPosition(svgEl.parentElement as HTMLElement || document.body)

    assets.push({
      kind: 'svg',
      src,
      mimeType: 'image/svg+xml',
      fileName: `svg_asset_${index++}.svg`,
      width: w || position.width,
      height: h || position.height,
      position,
    })
  })

  return assets
}
