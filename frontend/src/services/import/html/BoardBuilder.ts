/**
 * BoardBuilder.ts
 * Converts extracted raw assets (with positions) into the ImportResult format
 * that CanvasPage understands — without any knowledge of tldraw internals.
 *
 * It also handles:
 *  • coordinate normalisation (origin at 0,0)
 *  • z-index ordering (shapes are created lowest-z first)
 *  • checksum-based deduplication (via the provided checksumIndex)
 */

import { RawAsset } from './AssetExtractor'
import { normalisePositions, ElementPosition } from './PositionExtractor'
import { ImportedAsset, ImportedShape, ImportResult } from '../importers/ImageImporter'
import { StorageProvider } from '../../../types'
import { ImportReporter } from './ImportReport'

// ─── SHA-256 via Web Crypto ────────────────────────────────────────────────

async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Persistent checksum → assetId cache in localStorage (scoped per storage provider)
function loadChecksumIndex(providerName: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`whiteboard_asset_checksums_${providerName}`) || '{}')
  } catch {
    return {}
  }
}

function saveChecksumIndex(providerName: string, index: Record<string, string>) {
  localStorage.setItem(`whiteboard_asset_checksums_${providerName}`, JSON.stringify(index))
}

// ─── Blob resolution ──────────────────────────────────────────────────────

async function srcToBlob(src: string, mimeType: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    // Base64 data URL
    const [, b64] = src.split(',')
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mimeType })
  }
  // Regular URL (relative or absolute)
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Failed to fetch asset: ${src} (${response.status})`)
  return response.blob()
}

// ─── Main builder ─────────────────────────────────────────────────────────

export interface BuildOptions {
  storage: StorageProvider
  reporter: ImportReporter
  onProgress: (phase: string, pct: number) => void
}

export async function buildBoard(
  rawAssets: RawAsset[],
  options: BuildOptions
): Promise<ImportResult> {
  const { storage, reporter, onProgress } = options

  // Sort by z-index so lower z-order shapes are created first (painter's algorithm)
  const sorted = [...rawAssets].sort((a, b) => a.position.zIndex - b.position.zIndex)

  // Normalise positions so top-left element starts at (0, 0)
  const positions: ElementPosition[] = sorted.map((a) => a.position)
  const normPos = normalisePositions(positions)

  const providerName = storage.name || 'local'
  const checksumIndex = loadChecksumIndex(providerName)
  const importedAssets: ImportedAsset[] = []
  const importedShapes: ImportedShape[] = []

  reporter.startUploadTimer()

  for (let i = 0; i < sorted.length; i++) {
    const raw = sorted[i]
    const pos = normPos[i]
    const pct = Math.round(40 + (i / sorted.length) * 50)

    onProgress(`Uploading asset ${i + 1} of ${sorted.length}: ${raw.fileName}`, pct)

    let blob: Blob
    try {
      blob = await srcToBlob(raw.src, raw.mimeType)
    } catch (err: any) {
      reporter.error(`Skipped asset "${raw.fileName}": ${err.message}`)
      continue
    }

    // Checksum deduplication
    const checksum = await sha256(blob)
    const existingAssetId = checksumIndex[checksum]

    let assetId: string
    let blobUrl: string

    if (existingAssetId) {
      reporter.incrementDuplicatesSkipped()
      reporter.log(`Duplicate detected for "${raw.fileName}" — reusing asset ${existingAssetId}`)
      assetId = existingAssetId
      // Still need a blob URL for immediate rendering
      try {
        const existingBlob = await storage.downloadAsset(assetId)
        blobUrl = URL.createObjectURL(existingBlob)
      } catch {
        blobUrl = URL.createObjectURL(blob)
      }
    } else {
      assetId = await storage.uploadAsset(raw.fileName, raw.mimeType, blob)
      checksumIndex[checksum] = assetId
      reporter.incrementAssetsUploaded()
      reporter.log(`Uploaded "${raw.fileName}" → assetId: ${assetId}`)

      const downloadedBlob = await storage.downloadAsset(assetId)
      blobUrl = URL.createObjectURL(downloadedBlob)
    }

    // Determine final width/height — use extracted size or fall back to position bounds
    const width = raw.width > 0 ? raw.width : pos.width
    const height = raw.height > 0 ? raw.height : pos.height

    importedAssets.push({
      assetId,
      src: blobUrl,
      fileName: raw.fileName,
      mimeType: raw.mimeType,
      width,
      height,
    })

    importedShapes.push({
      assetId,
      x: pos.x,
      y: pos.y,
      width,
      height,
    })
  }

  reporter.stopUploadTimer()
  saveChecksumIndex(providerName, checksumIndex)

  reporter.setGeneratedBoardObjects(importedShapes.length)
  return { _importResult: true, importedAssets, importedShapes }
}
