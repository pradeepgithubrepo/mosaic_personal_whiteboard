/**
 * PositionExtractor.ts
 * Reads an element's inline styles / CSS transforms and converts them to
 * flat canvas coordinates usable by the BoardBuilder.
 */

export interface ElementPosition {
  x: number
  y: number
  width: number
  height: number
  rotation: number   // degrees
  scaleX: number
  scaleY: number
  opacity: number
  zIndex: number
}

/**
 * Parse a CSS transform string and extract rotation and scale values.
 * Handles: rotate(Ndeg), rotateZ(Ndeg), matrix(a,b,c,d,e,f), scale(x,y)
 */
function parseTransform(transform: string): { rotation: number; scaleX: number; scaleY: number } {
  let rotation = 0
  let scaleX = 1
  let scaleY = 1

  if (!transform || transform === 'none') return { rotation, scaleX, scaleY }

  // matrix(a, b, c, d, tx, ty) → rotation = atan2(b, a), scale = sqrt(a²+b²)
  const matrixMatch = transform.match(/matrix\(([^)]+)\)/)
  if (matrixMatch) {
    const [a, b] = matrixMatch[1].split(',').map(Number)
    rotation = Math.round((Math.atan2(b, a) * 180) / Math.PI)
    scaleX = Math.sqrt(a * a + b * b)
    scaleY = scaleX
    return { rotation, scaleX, scaleY }
  }

  // rotate(Ndeg) or rotateZ(Ndeg)
  const rotateMatch = transform.match(/rotateZ?\(([^)]+)\)/)
  if (rotateMatch) {
    const val = rotateMatch[1].trim()
    rotation = val.endsWith('rad')
      ? Math.round((parseFloat(val) * 180) / Math.PI)
      : parseFloat(val)
  }

  // scale(x) or scale(x, y)
  const scaleMatch = transform.match(/scale\(([^)]+)\)/)
  if (scaleMatch) {
    const parts = scaleMatch[1].split(',').map(Number)
    scaleX = parts[0] || 1
    scaleY = parts[1] ?? scaleX
  }

  return { rotation, scaleX, scaleY }
}

/** Parse px / % value to a number (% treated as absolute for now) */
function parsePx(value: string, fallback = 0): number {
  if (!value) return fallback
  const n = parseFloat(value)
  return isNaN(n) ? fallback : n
}

/**
 * Extract position, size, rotation and z-order from a DOM element's
 * computed / inline styles. Works with both positioned divs and <img>/<svg>.
 */
export function extractPosition(el: HTMLElement | SVGElement): ElementPosition {
  const style = (el as HTMLElement).style || {}
  const rect = el.getBoundingClientRect?.() ?? null

  // Prefer explicit inline style values (offline documents have no layout)
  const left = parsePx(style.left) || parsePx(style.marginLeft) || 0
  const top = parsePx(style.top) || parsePx(style.marginTop) || 0
  const width =
    parsePx(style.width) ||
    (el as HTMLElement).offsetWidth ||
    rect?.width ||
    0
  const height =
    parsePx(style.height) ||
    (el as HTMLElement).offsetHeight ||
    rect?.height ||
    0

  const { rotation, scaleX, scaleY } = parseTransform(style.transform || '')

  return {
    x: left,
    y: top,
    width: width * scaleX,
    height: height * scaleY,
    rotation,
    scaleX,
    scaleY,
    opacity: parsePx(style.opacity || '1', 1),
    zIndex: parsePx(style.zIndex, 0),
  }
}

/**
 * Given a set of positioned elements, normalise so the top-left object
 * sits at (0, 0) and all others are offset accordingly.
 */
export function normalisePositions(positions: ElementPosition[]): ElementPosition[] {
  if (positions.length === 0) return []
  const minX = Math.min(...positions.map((p) => p.x))
  const minY = Math.min(...positions.map((p) => p.y))
  return positions.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }))
}
