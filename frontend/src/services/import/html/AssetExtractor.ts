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

  // 3. <svg> elements – extract nested <image> elements and serialize remaining shapes
  doc.querySelectorAll('svg').forEach((svgEl) => {
    // Skip tiny / invisible SVGs (icon sprites etc.)
    const w = parseFloat(svgEl.getAttribute('width') || svgEl.style.width || '0')
    const h = parseFloat(svgEl.getAttribute('height') || svgEl.style.height || '0')
    if (w < 10 && h < 10) return

    const position = extractPosition(svgEl.parentElement as HTMLElement || svgEl)

    // Check for nested image elements
    const images = svgEl.querySelectorAll('image')

    // Parse viewBox for scaling nested images
    let minX = 0
    let minY = 0
    let viewBoxWidth = w || position.width || 800
    let viewBoxHeight = h || position.height || 600

    const vbAttr = svgEl.getAttribute('viewBox')
    if (vbAttr) {
      const parts = vbAttr.split(/\s+/).map(Number)
      if (parts.length === 4 && !parts.some(isNaN)) {
        minX = parts[0]
        minY = parts[1]
        viewBoxWidth = parts[2]
        viewBoxHeight = parts[3]
      }
    }

    const parentWidth = w || position.width || viewBoxWidth
    const parentHeight = h || position.height || viewBoxHeight

    const scaleX = viewBoxWidth > 0 ? parentWidth / viewBoxWidth : 1
    const scaleY = viewBoxHeight > 0 ? parentHeight / viewBoxHeight : 1

    if (images.length > 0) {
      images.forEach((img) => {
        const href = img.getAttribute('href') || img.getAttribute('xlink:href')
        if (!href) return

        const imgX = parseFloat(img.getAttribute('x') || '0')
        const imgY = parseFloat(img.getAttribute('y') || '0')
        const imgW = parseFloat(img.getAttribute('width') || '0')
        const imgH = parseFloat(img.getAttribute('height') || '0')

        // Remove from the SVG so it is not rendered as part of the background/parent SVG drawing
        img.remove()

        // Place as a standalone image asset on the canvas
        // Translate coordinates: (imgX - minX) * scaleX relative to parent absolute position
        const absoluteX = position.x + (imgX - minX) * scaleX
        const absoluteY = position.y + (imgY - minY) * scaleY
        const targetW = imgW * scaleX
        const targetH = imgH * scaleY

        const mime = guessMimeFromSrc(href)
        assets.push({
          kind: 'image',
          src: href,
          mimeType: mime,
          fileName: sanitiseFileName(href, index++, mime),
          width: targetW,
          height: targetH,
          position: {
            x: absoluteX,
            y: absoluteY,
            width: targetW,
            height: targetH,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            zIndex: position.zIndex + 1, // place above parent
          },
        })
      })
    }

    // Now, if there is still visual content in the SVG, serialize it
    const visualSelectors = 'path, rect, circle, ellipse, line, polyline, polygon, text, g'
    const visualElements = svgEl.querySelectorAll(visualSelectors)
    let hasVisualContent = false

    for (const el of Array.from(visualElements)) {
      if (el.tagName.toLowerCase() === 'g') {
        const children = el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text')
        if (children.length > 0) {
          hasVisualContent = true
          break
        }
      } else {
        hasVisualContent = true
        break
      }
    }

    if (hasVisualContent) {
      const src = svgToDataUrl(svgEl as SVGElement)
      assets.push({
        kind: 'svg',
        src,
        mimeType: 'image/svg+xml',
        fileName: `svg_asset_${index++}.svg`,
        width: parentWidth,
        height: parentHeight,
        position: {
          ...position,
          width: parentWidth,
          height: parentHeight,
        },
      })
    }
  })

  return assets
}
