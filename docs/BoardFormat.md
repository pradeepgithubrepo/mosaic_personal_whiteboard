# Board Format - Mosaic Whiteboard

This document specifies the JSON format used for all whiteboard boards, including imported boards.

---

## Standard Board Schema

All boards are persisted as a single JSON document. The top-level structure is:

```typescript
interface Board {
  id: string           // UUID v4
  title: string        // Human-readable title, derived from filename on import
  createdAt: string    // ISO 8601 timestamp
  updatedAt: string    // ISO 8601 timestamp (auto-updated on every save)
  elements: TldrawSnapshot  // Serialized tldraw store snapshot
  metadata?: BoardMetadata

  // Migration-specific fields (present on imported boards)
  source?: string      // e.g. "Microsoft Whiteboard"
  importType?: string  // e.g. "PNG", "PDF Importer"
  schemaVersion?: number  // Always 1 for imported boards
}
```

---

## Imported Board Example (PNG)

```json
{
  "id": "a4c9f1d2-...",
  "title": "Q3 Planning Whiteboard",
  "createdAt": "2026-07-25T17:00:00.000Z",
  "updatedAt": "2026-07-25T17:00:02.000Z",
  "source": "Microsoft Whiteboard",
  "importType": "Image Importer",
  "schemaVersion": 1,
  "elements": {
    "store": {
      "document:document": { "id": "document:document", "typeName": "document" },
      "page:page": { "id": "page:page", "typeName": "page", "name": "Page 1" },
      "asset:abc123": {
        "id": "asset:abc123",
        "typeName": "asset",
        "type": "image",
        "props": {
          "name": "Q3 Planning Whiteboard.png",
          "src": "asset-id://abc123",
          "w": 1920,
          "h": 1080,
          "mimeType": "image/png"
        }
      },
      "shape:xyz789": {
        "id": "shape:xyz789",
        "typeName": "shape",
        "type": "image",
        "x": 0,
        "y": 0,
        "rotation": 0,
        "isLocked": true,
        "parentId": "page:page",
        "props": {
          "w": 1920,
          "h": 1080,
          "assetId": "asset:abc123"
        }
      }
    },
    "schema": {
      "schemaVersion": 2
    }
  }
}
```

---

## Asset Reference Protocol

> **Critical Rule:** Image binary data is **never** embedded in the board JSON.

| Context | Value stored in `asset.props.src` |
|:--------|:----------------------------------|
| Persisted to storage | `asset-id://<assetId>` |
| Loaded in browser memory | `blob:http://localhost:5173/...` (temporary Object URL) |

On board load, `CanvasPage.tsx` resolves every `asset-id://` reference by downloading the asset blob from the active `StorageProvider` and swapping it with a local `URL.createObjectURL()` value. On auto-save, the change listener reverses this — stripping `blob:` URLs back to `asset-id://` before persisting.

---

## PDF Multi-Page Board Example

For a 3-page PDF, the board contains one `asset` + one `shape` per page. Pages are stacked vertically:

| Page | y position |
|:-----|:-----------|
| 1 | 100px |
| 2 | 100 + height₁ + 50 |
| 3 | 100 + height₁ + height₂ + 100 |

Each shape has `isLocked: true` so the imported content cannot be accidentally moved before the user explicitly unlocks it.

---

## Board Metadata Schema

```typescript
interface BoardMetadata {
  tags?: string[]         // e.g. ["imported", "pdf importer"]
  description?: string    // e.g. "Imported from Q3Planning.pdf (PDF Importer)"
  isFavorite?: boolean
  theme?: 'light' | 'dark' | 'system'
}
```

---

## Schema Versioning

The `schemaVersion` field in `elements.schema` follows tldraw's own versioning. Current version is `2`. Mosaic does not modify this value — it mirrors whatever tldraw's `getSnapshot()` returns at save time.

The top-level `schemaVersion: 1` on imported boards refers to Mosaic's own migration schema version, not tldraw's store schema.
