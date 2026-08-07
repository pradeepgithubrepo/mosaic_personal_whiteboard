/**
 * BoardBuilder.ts
 * Converts extracted raw assets (with positions) into an ExcalidrawScene.
 * Images are stored inline as base64 data URLs — no Drive asset upload needed.
 *
 * Handles:
 *  • coordinate normalisation (origin at 0,0)
 *  • z-index ordering (shapes created lowest-z first)
 *  • SHA-256 deduplication (reuses fileId for identical blobs)
 */

import { RawAsset } from './AssetExtractor'
import { normalisePositions, ElementPosition } from './PositionExtractor'
import type { ExcalidrawScene } from '../../../types'
import { buildImageScene } from '../importers/ImageImporter'
import { ImportReporter } from './ImportReport'

async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function srcToBlob(src: string, mimeType: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    const [, b64] = src.split(',')
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mimeType })
  }
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Failed to fetch asset: ${src} (${response.status})`)
  return response.blob()
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to encode blob as data URL'))
    reader.readAsDataURL(blob)
  })
}

export interface BuildOptions {
  reporter: ImportReporter
  onProgress: (phase: string, pct: number) => void
}

export async function buildBoard(
  rawAssets: RawAsset[],
  options: BuildOptions
): Promise<ExcalidrawScene> {
  const { reporter, onProgress } = options

  const sorted = [...rawAssets].sort((a, b) => a.position.zIndex - b.position.zIndex)
  const positions: ElementPosition[] = sorted.map((a) => a.position)
  const normPos = normalisePositions(positions)

  // Checksum deduplication: identical images share the same fileId
  const checksumToFileId = new Map<string, string>()

  const allElements: any[] = []
  const allFiles: Record<string, any> = {}

  reporter.startUploadTimer()

  for (let i = 0; i < sorted.length; i++) {
    const raw = sorted[i]
    const pos = normPos[i]
    const pct = Math.round(40 + (i / sorted.length) * 50)
    onProgress(`Processing asset ${i + 1} of ${sorted.length}: ${raw.fileName}`, pct)

    let blob: Blob
    try {
      blob = await srcToBlob(raw.src, raw.mimeType)
    } catch (err: any) {
      reporter.error(`Skipped asset "${raw.fileName}": ${err.message}`)
      continue
    }

    const checksum = await sha256(blob)
    let dataURL: string

    if (checksumToFileId.has(checksum)) {
      // Duplicate — reuse the existing dataURL from allFiles
      const existingFileId = checksumToFileId.get(checksum)!
      dataURL = allFiles[existingFileId]?.dataURL
      reporter.incrementDuplicatesSkipped()
      reporter.log(`Duplicate "${raw.fileName}" — reusing fileId ${existingFileId}`)
    } else {
      dataURL = await blobToDataURL(blob)
      reporter.incrementAssetsUploaded()
      reporter.log(`Encoded "${raw.fileName}"`)
    }

    const width = raw.width > 0 ? raw.width : pos.width
    const height = raw.height > 0 ? raw.height : pos.height

    const scene = buildImageScene(dataURL, raw.mimeType, width, height, pos.x, pos.y)
    // Track new fileId for deduplication
    const fileId = Object.keys(scene.files)[0]
    if (!checksumToFileId.has(checksum)) {
      checksumToFileId.set(checksum, fileId)
    }

    allElements.push(...scene.elements)
    Object.assign(allFiles, scene.files)
  }

  reporter.stopUploadTimer()
  reporter.setGeneratedBoardObjects(allElements.length)

  return {
    elements: allElements,
    appState: { viewBackgroundColor: '#ffffff' },
    files: allFiles,
  }
}
