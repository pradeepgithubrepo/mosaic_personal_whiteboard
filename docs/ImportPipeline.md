# Import Pipeline - Mosaic Whiteboard

This document describes the modular import pipeline that allows external whiteboard content (PNG, JPEG, SVG, PDF) to be migrated into Mosaic boards.

---

## Pipeline Overview

```
Import UI (ImportModal / Sidebar)
         │
         ▼
   ImportManager
   ┌─────────────────────────────┐
   │  getImporter(file)          │  ← Dispatches to the first matching Importer
   │  analyzeFile(file)          │  ← Returns ImportAnalysis (preview data)
   │  importFile(file, ...)      │  ← Orchestrates the full import flow
   └─────────────────────────────┘
         │
         ▼
   Importer Interface
   ┌─────────────────────────────┐
   │  supports(file): boolean    │
   │  analyze(file)              │
   │  import(file, progress, storage) │
   └─────────────────────────────┘
         │
    ┌────┼────────────────┬────────────────┐
    ▼    ▼                ▼                ▼
MipImporter           HtmlImporter      ImageImporter    PDFImporter
(.mip.zip / .zip)     (HTML DOM)        (PNG, JPEG)      (PDF pages)
    ▼
SVGImporter
(SVG vector)
         │
         ▼
   Board Builder (inside each Importer)
   ─ Builds tldraw-compatible snapshot
   ─ asset records: src = "asset-id://<assetId>"
   ─ shape records: isLocked = true, centered
         │
         ▼
   BoardRepository.save(board)
         │
         ▼
   StorageProvider (LocalProvider / GoogleDriveProvider)
   ─ Boards saved to Boards/
   ─ Image assets saved to Images/
```

---

## Importer Interface Contract

Every importer must implement the following TypeScript interface defined in `src/services/import/Importer.ts`:

```typescript
interface Importer {
  name: string
  supportedMimeTypes: string[]
  supports(file: File): boolean
  analyze(file: File): Promise<ImportAnalysis>
  import(
    file: File,
    onProgress: (phase: string, percent: number) => void,
    storage: StorageProvider
  ): Promise<any>  // Returns a tldraw-compatible snapshot object
}
```

### ImportAnalysis Shape
```typescript
interface ImportAnalysis {
  fileName: string
  fileSize: number
  mimeType: string
  estimatedBoardSize?: { width: number; height: number }
  estimatedUploadSize?: number
  pagesCount?: number  // PDF only
  isValid: boolean
  error?: string
}
```

---

## Format-Specific Strategies

### PNG / JPEG (`ImageImporter`)
1. Load image in browser → decode `naturalWidth`, `naturalHeight`.
2. Upload raw file to storage → receive `assetId`.
3. Build a single locked `image` shape centered in a 1920×1080 canvas area.

### SVG (`SVGImporter`)
1. Parse SVG text to read `width`/`height`/`viewBox`.
2. Upload SVG file as `image/svg+xml` asset.
3. Build a single locked `image` shape preserving vector dimensions.
4. No SVG element parsing is attempted — never fails due to unsupported SVG features.

### PDF (`PDFImporter`)
1. Load PDF using `pdfjs-dist` (worker served from unpkg CDN).
2. Render each page at 1.5× scale onto an HTML5 `<canvas>`.
3. Export each page canvas to a PNG Blob.
4. Upload each page PNG independently → receive unique `assetId` per page.
5. Stack pages vertically on the tldraw canvas with 50px spacing.
6. Center all pages horizontally relative to the widest page.
7. All page shapes are locked by default.

---

## Asset Reference Protocol

Imported images are **never embedded** in board JSON. Instead:

- During import: `asset.props.src = "asset-id://<assetId>"`
- During canvas load: `CanvasPage.tsx` intercepts `asset-id://` prefixes, downloads Blobs, creates browser Object URLs (`blob:http://...`), and swaps `src` in-memory before loading into tldraw.
- During auto-save: The change listener strips `blob:` URLs back to `asset-id://<assetId>` before persisting the snapshot.

This keeps board JSON clean and provider-agnostic.

---

## Adding a New Importer (Future Formats)

1. Create `src/services/import/importers/YourFormatImporter.ts` implementing `Importer`.
2. Register it in `ImportManager.ts`:
   ```typescript
   import { YourFormatImporter } from './importers/YourFormatImporter'
   private static importers: Importer[] = [
     new ImageImporter(),
     new SVGImporter(),
     new PDFImporter(),
     new YourFormatImporter(),  // ← add here
   ]
   ```
3. **No UI changes required.** The `ImportModal` automatically uses `ImportManager.getImporter(file)` to dispatch to the correct importer.

---

## Import History

Every import attempt (success or failure) is recorded in `localStorage` under the key `whiteboard_import_logs`. The log entry schema is:

```typescript
interface ImportLog {
  id: string
  importDate: string        // ISO timestamp
  originalFileName: string
  importType: string        // e.g. "PDF Importer"
  boardId: string
  assetsCount: number
  durationMs: number
  status: 'success' | 'failed'
  error?: string
}
```

The full history is visible in **Settings → Whiteboard Migration Logs**.
