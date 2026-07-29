import { StorageProvider, Board, BoardHeader } from '../../types'
import { STORAGE_KEYS } from '../StorageProvider'

export class LocalProvider implements StorageProvider {
  public name = 'local'

  // Helper to get index
  private getIndex(): BoardHeader[] {
    const data = localStorage.getItem(STORAGE_KEYS.BOARD_INDEX)
    if (!data) return []
    try {
      return JSON.parse(data)
    } catch {
      return []
    }
  }

  // Helper to save index
  private saveIndex(index: BoardHeader[]): void {
    localStorage.setItem(STORAGE_KEYS.BOARD_INDEX, JSON.stringify(index))
  }

  public async saveBoard(board: Board): Promise<void> {
    // 1. Save full board content
    localStorage.setItem(`${STORAGE_KEYS.BOARD_PREFIX}${board.id}`, JSON.stringify(board))

    // 2. Update board index metadata
    const index = this.getIndex()
    const header: BoardHeader = {
      id: board.id,
      title: board.title,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      thumbnail: board.thumbnail,
    }

    const existingIndex = index.findIndex((b) => b.id === board.id)
    if (existingIndex > -1) {
      index[existingIndex] = header
    } else {
      index.push(header)
    }
    this.saveIndex(index)
  }

  public async loadBoard(id: string): Promise<Board | null> {
    const data = localStorage.getItem(`${STORAGE_KEYS.BOARD_PREFIX}${id}`)
    if (!data) return null
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  public async deleteBoard(id: string): Promise<void> {
    // Remove board content
    localStorage.removeItem(`${STORAGE_KEYS.BOARD_PREFIX}${id}`)

    // Remove from index
    const index = this.getIndex()
    const updated = index.filter((b) => b.id !== id)
    this.saveIndex(updated)
  }

  public async listBoards(): Promise<BoardHeader[]> {
    return this.getIndex()
  }

  // Simulated asset upload - saves as base64 in localStorage
  public async uploadAsset(fileName: string, mimeType: string, data: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64data = reader.result as string
        const assetId = `local_asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        try {
          localStorage.setItem(`whiteboard_asset_${assetId}`, JSON.stringify({ fileName, mimeType, data: base64data }))
          resolve(assetId)
        } catch (e) {
          reject(new Error('LocalStorage limit exceeded while saving asset locally.'))
        }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(data)
    })
  }

  public async downloadAsset(assetId: string): Promise<Blob> {
    const cleanId = assetId.replace(/^asset-id:\/\//, '')
    const raw = localStorage.getItem(`whiteboard_asset_${cleanId}`)
    if (!raw) {
      throw new Error(`Asset not found: ${cleanId}`)
    }
    const { mimeType, data } = JSON.parse(raw)
    const base64Content = data.split(',')[1]
    const binary = atob(base64Content)
    const array = []
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i))
    }
    return new Blob([new Uint8Array(array)], { type: mimeType })
  }

  public async deleteAsset(assetId: string): Promise<void> {
    const cleanId = assetId.replace(/^asset-id:\/\//, '')
    localStorage.removeItem(`whiteboard_asset_${cleanId}`)
  }

  // Low-level Workspace & File CRUD operations (Phase 2 Validation)
  public async authenticate(): Promise<void> {
    return Promise.resolve()
  }

  public async findRootFolder(): Promise<string | null> {
    const rootId = localStorage.getItem('whiteboard_local_root_folder_id')
    return rootId || null
  }

  public async createRootFolder(): Promise<string> {
    const rootId = 'local_root_folder_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('whiteboard_local_root_folder_id', rootId)
    return rootId
  }

  public async uploadFile(folderId: string, fileName: string, mimeType: string, content: string | Blob): Promise<string> {
    const fileId = `local_file_${folderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    let textContent = ''

    if (content instanceof Blob) {
      textContent = await new Promise<string>((resolve) => {
        const r = new FileReader()
        r.onloadend = () => resolve(r.result as string)
        r.readAsText(content)
      })
    } else {
      textContent = content
    }

    const fileObj = { id: fileId, name: fileName, mimeType, content: textContent, folderId }
    localStorage.setItem(`whiteboard_file_${fileId}`, JSON.stringify(fileObj))
    return fileId
  }

  public async downloadFile(fileId: string): Promise<string> {
    const raw = localStorage.getItem(`whiteboard_file_${fileId}`)
    if (!raw) throw new Error(`File not found: ${fileId}`)
    const fileObj = JSON.parse(raw)
    return fileObj.content
  }

  public async updateFile(fileId: string, content: string | Blob): Promise<void> {
    const raw = localStorage.getItem(`whiteboard_file_${fileId}`)
    if (!raw) throw new Error(`File not found: ${fileId}`)
    const fileObj = JSON.parse(raw)
    
    let textContent = ''
    if (content instanceof Blob) {
      textContent = await new Promise<string>((resolve) => {
        const r = new FileReader()
        r.onloadend = () => resolve(r.result as string)
        r.readAsText(content)
      })
    } else {
      textContent = content
    }

    fileObj.content = textContent
    localStorage.setItem(`whiteboard_file_${fileId}`, JSON.stringify(fileObj))
  }

  public async deleteFile(fileId: string): Promise<void> {
    localStorage.removeItem(`whiteboard_file_${fileId}`)
  }

  public async listFiles(folderId: string): Promise<{ id: string; name: string }[]> {
    const list: { id: string; name: string }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('whiteboard_file_')) {
        try {
          const val = localStorage.getItem(key)
          if (val) {
            const fileObj = JSON.parse(val)
            if (fileObj.folderId === folderId) {
              list.push({ id: fileObj.id, name: fileObj.name })
            }
          }
        } catch {
          // ignore parsing error
        }
      }
    }
    return list
  }
}
