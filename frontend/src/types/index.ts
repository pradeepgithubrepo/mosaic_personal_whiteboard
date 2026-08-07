export interface BoardMetadata {
  tags?: string[]
  description?: string
  isFavorite?: boolean
  theme?: 'light' | 'dark' | 'system'
}

export interface BoardHeader {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  thumbnail?: string
}

/**
 * Excalidraw scene persisted to Drive / storage.
 * Mirrors the shape of data returned by Excalidraw's onChange callback
 * and expected by the initialData prop.
 */
export interface ExcalidrawScene {
  elements: readonly any[]        // ExcalidrawElement[]
  appState: Record<string, any>   // Partial<AppState>
  files: Record<string, any>      // BinaryFiles — image data keyed by fileId
}

export interface Board extends BoardHeader {
  elements: ExcalidrawScene | null  // null = brand-new empty board
  metadata?: BoardMetadata
}

export interface ImageObject {
  driveFileId: string // The unique identifier of the file in the storage provider
  thumbnail?: string // Optional base64 preview
  width: number
  height: number
  x: number
  y: number
  rotation: number
}

export interface StorageProvider {
  name: string
  
  // Board CRUD operations
  saveBoard(board: Board): Promise<void>
  loadBoard(id: string): Promise<Board | null>
  deleteBoard(id: string): Promise<void>
  listBoards(): Promise<BoardHeader[]>
  
  // Asset management operations
  uploadAsset(fileName: string, mimeType: string, data: Blob): Promise<string>
  downloadAsset(assetId: string): Promise<Blob>
  deleteAsset(assetId: string): Promise<void>

  // Low-level Workspace & File CRUD operations (Phase 2 Validation)
  authenticate(): Promise<void>
  findRootFolder(): Promise<string | null>
  createRootFolder(): Promise<string>
  uploadFile(folderId: string, fileName: string, mimeType: string, content: string | Blob): Promise<string>
  downloadFile(fileId: string): Promise<string>
  updateFile(fileId: string, content: string | Blob): Promise<void>
  deleteFile(fileId: string): Promise<void>
  listFiles(folderId: string): Promise<{ id: string; name: string }[]>
}
