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

export interface Board extends BoardHeader {
  elements: any // Serialized tldraw canvas shape data (records/snapshot)
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
