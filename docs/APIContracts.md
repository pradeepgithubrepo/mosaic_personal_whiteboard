# API Contracts - Infinite Whiteboard

This document defines the TypeScript interfaces and contracts used for storage and board management in the Infinite Whiteboard application.

---

## 1. Data Models

### Board
Representing the serialized state of a single whiteboard.

```typescript
export interface Board {
  id: string;               // UUID (v4)
  title: string;            // Name of the board
  createdAt: string;        // ISO 8601 string
  updatedAt: string;        // ISO 8601 string
  thumbnail?: string;       // Optional base64 or URL thumbnail
  elements: any[];          // Serialized tldraw canvas shape data
  metadata?: BoardMetadata; // Open-ended metadata object for future capabilities
}

export interface BoardMetadata {
  tags?: string[];
  description?: string;
  isFavorite?: boolean;
  theme?: 'light' | 'dark' | 'system';
}
```

### ImageObject
Represents an image asset placed on the canvas, pointing to the original file in the active storage provider.

```typescript
export interface ImageObject {
  driveFileId: string;      // The unique identifier of the file in Google Drive/LocalStorage
  thumbnail?: string;       // Low-res preview base64 data
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;         // Rotation in radians
}
```

---

## 2. Storage Provider Interface

```typescript
export interface StorageProvider {
  name: string;             // 'local' | 'google-drive' | 'onedrive' etc.
  
  // Board CRUD operations
  saveBoard(board: Board): Promise<void>;
  loadBoard(id: string): Promise<Board | null>;
  deleteBoard(id: string): Promise<void>;
  listBoards(): Promise<BoardHeader[]>; // List just titles/IDs for speed
  
  // Asset management operations (Phase 2+)
  uploadAsset(fileName: string, mimeType: string, data: Blob): Promise<string>; // Returns asset ID
  downloadAsset(assetId: string): Promise<Blob>;
  deleteAsset(assetId: string): Promise<void>;
}

export interface BoardHeader {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}
```

---

## 3. Board Repository Interface

The `BoardRepository` handles caching, debouncing saves, and orchestrating the active `StorageProvider`.

```typescript
export interface IBoardRepository {
  setProvider(provider: StorageProvider): void;
  getProvider(): StorageProvider;
  
  list(): Promise<BoardHeader[]>;
  load(id: string): Promise<Board | null>;
  save(board: Board): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string, newTitle?: string): Promise<Board>;
}
```
