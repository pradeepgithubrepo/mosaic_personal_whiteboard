import { StorageProvider, Board, BoardHeader } from '../../types'
import { STORAGE_KEYS } from '../StorageProvider'

class IndexedDBStore {
  private dbName = 'whiteboard_local_db'
  private dbVersion = 1
  private db: IDBDatabase | null = null

  public getDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db)
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('boards')) {
          db.createObjectStore('boards', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('keyvalue')) {
          db.createObjectStore('keyvalue')
        }
      }
      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }
      request.onerror = () => reject(request.error)
    })
  }

  public async getBoard(id: string): Promise<any | null> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readonly')
      const store = tx.objectStore('boards')
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  }

  public async putBoard(board: any): Promise<void> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite')
      const store = tx.objectStore('boards')
      const req = store.put(board)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  public async deleteBoard(id: string): Promise<void> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite')
      const store = tx.objectStore('boards')
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  public async getAllBoards(): Promise<any[]> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readonly')
      const store = tx.objectStore('boards')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }

  public async getKeyValue(key: string): Promise<any> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keyvalue', 'readonly')
      const store = tx.objectStore('keyvalue')
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  public async setKeyValue(key: string, value: any): Promise<void> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keyvalue', 'readwrite')
      const store = tx.objectStore('keyvalue')
      const req = store.put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  public async removeKeyValue(key: string): Promise<void> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keyvalue', 'readwrite')
      const store = tx.objectStore('keyvalue')
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}

export class LocalProvider implements StorageProvider {
  public name = 'local'
  private dbStore = new IndexedDBStore()
  private migrationPromise: Promise<void> | null = null

  private async ensureMigration(): Promise<void> {
    if (this.migrationPromise) return this.migrationPromise
    this.migrationPromise = (async () => {
      try {
        const indexData = localStorage.getItem(STORAGE_KEYS.BOARD_INDEX)
        if (!indexData) return

        const index: BoardHeader[] = JSON.parse(indexData)
        if (!Array.isArray(index) || index.length === 0) return

        console.log(`IndexedDB Migration: Found ${index.length} board(s) in localStorage. Migrating...`)
        for (const item of index) {
          const rawBoard = localStorage.getItem(`${STORAGE_KEYS.BOARD_PREFIX}${item.id}`)
          if (rawBoard) {
            try {
              const boardObj = JSON.parse(rawBoard)
              await this.dbStore.putBoard(boardObj)
              console.log(`IndexedDB Migration: Migrated board "${item.title}" (${item.id})`)
              localStorage.removeItem(`${STORAGE_KEYS.BOARD_PREFIX}${item.id}`)
            } catch (err) {
              console.error(`IndexedDB Migration: Failed to migrate board ${item.id}`, err)
            }
          }
        }

        // Migrate loose assets if any
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('whiteboard_asset_')) {
            try {
              const raw = localStorage.getItem(key)
              if (raw) {
                const assetObj = JSON.parse(raw)
                const cleanId = key.replace(/^whiteboard_asset_/, '')
                const db = await this.dbStore.getDB()
                const tx = db.transaction('assets', 'readwrite')
                const store = tx.objectStore('assets')
                await new Promise<void>((resolve, reject) => {
                  const req = store.put({ id: cleanId, ...assetObj })
                  req.onsuccess = () => resolve()
                  req.onerror = () => reject(req.error)
                })
                localStorage.removeItem(key)
              }
            } catch (err) {
              console.error('IndexedDB Migration: Failed to migrate asset:', key, err)
            }
          }
        }

        // Migrate whiteboard files
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('whiteboard_file_')) {
            try {
              const raw = localStorage.getItem(key)
              if (raw) {
                const fileObj = JSON.parse(raw)
                await this.dbStore.setKeyValue(key, fileObj)
                localStorage.removeItem(key)
              }
            } catch (err) {
              console.error('IndexedDB Migration: Failed to migrate file:', key, err)
            }
          }
        }

        localStorage.removeItem(STORAGE_KEYS.BOARD_INDEX)
        console.log('IndexedDB Migration: Complete.')
      } catch (e) {
        console.error('IndexedDB Migration failed:', e)
      }
    })()
    return this.migrationPromise
  }

  public async saveBoard(board: Board): Promise<void> {
    await this.ensureMigration()
    await this.dbStore.putBoard(board)
  }

  public async loadBoard(id: string): Promise<Board | null> {
    await this.ensureMigration()
    return this.dbStore.getBoard(id)
  }

  public async deleteBoard(id: string): Promise<void> {
    await this.ensureMigration()
    await this.dbStore.deleteBoard(id)
  }

  public async listBoards(): Promise<BoardHeader[]> {
    await this.ensureMigration()
    const boards = await this.dbStore.getAllBoards()
    return boards
      .map((b) => ({
        id: b.id,
        title: b.title,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        thumbnail: b.thumbnail,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  public async uploadAsset(fileName: string, mimeType: string, data: Blob): Promise<string> {
    await this.ensureMigration()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64data = reader.result as string
        const assetId = `local_asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        try {
          const db = await this.dbStore.getDB()
          const tx = db.transaction('assets', 'readwrite')
          const store = tx.objectStore('assets')
          await new Promise<void>((res, rej) => {
            const req = store.put({ id: assetId, fileName, mimeType, data: base64data })
            req.onsuccess = () => res()
            req.onerror = () => rej(req.error)
          })
          resolve(assetId)
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(data)
    })
  }

  public async downloadAsset(assetId: string): Promise<Blob> {
    await this.ensureMigration()
    const cleanId = assetId.replace(/^asset-id:\/\//, '')

    // Check localStorage fallback
    const oldRaw = localStorage.getItem(`whiteboard_asset_${cleanId}`)
    if (oldRaw) {
      const { mimeType, data } = JSON.parse(oldRaw)
      const base64Content = data.split(',')[1]
      const binary = atob(base64Content)
      const array = []
      for (let i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i))
      }
      return new Blob([new Uint8Array(array)], { type: mimeType })
    }

    const db = await this.dbStore.getDB()
    const entry = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction('assets', 'readonly')
      const store = tx.objectStore('assets')
      const req = store.get(cleanId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (!entry) {
      throw new Error(`Asset not found: ${cleanId}`)
    }

    const base64Content = entry.data.split(',')[1]
    const binary = atob(base64Content)
    const array = []
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i))
    }
    return new Blob([new Uint8Array(array)], { type: entry.mimeType })
  }

  public async deleteAsset(assetId: string): Promise<void> {
    await this.ensureMigration()
    const cleanId = assetId.replace(/^asset-id:\/\//, '')
    localStorage.removeItem(`whiteboard_asset_${cleanId}`)

    const db = await this.dbStore.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite')
      const store = tx.objectStore('assets')
      const req = store.delete(cleanId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  public async authenticate(): Promise<void> {
    return Promise.resolve()
  }

  public async findRootFolder(): Promise<string | null> {
    const rootId = await this.dbStore.getKeyValue('whiteboard_local_root_folder_id')
    return rootId || localStorage.getItem('whiteboard_local_root_folder_id') || null
  }

  public async createRootFolder(): Promise<string> {
    const rootId = 'local_root_folder_' + Math.random().toString(36).substr(2, 9)
    await this.dbStore.setKeyValue('whiteboard_local_root_folder_id', rootId)
    localStorage.setItem('whiteboard_local_root_folder_id', rootId)
    return rootId
  }

  public async uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    content: string | Blob
  ): Promise<string> {
    await this.ensureMigration()
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
    await this.dbStore.setKeyValue(`whiteboard_file_${fileId}`, fileObj)
    return fileId
  }

  public async downloadFile(fileId: string): Promise<string> {
    await this.ensureMigration()
    const fileObj = await this.dbStore.getKeyValue(`whiteboard_file_${fileId}`)
    if (fileObj) return fileObj.content

    const raw = localStorage.getItem(`whiteboard_file_${fileId}`)
    if (!raw) throw new Error(`File not found: ${fileId}`)
    const parsedObj = JSON.parse(raw)
    return parsedObj.content
  }

  public async updateFile(fileId: string, content: string | Blob): Promise<void> {
    await this.ensureMigration()
    let fileObj = await this.dbStore.getKeyValue(`whiteboard_file_${fileId}`)
    if (!fileObj) {
      const raw = localStorage.getItem(`whiteboard_file_${fileId}`)
      if (raw) fileObj = JSON.parse(raw)
    }

    if (!fileObj) throw new Error(`File not found: ${fileId}`)

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
    await this.dbStore.setKeyValue(`whiteboard_file_${fileId}`, fileObj)
    localStorage.removeItem(`whiteboard_file_${fileId}`)
  }

  public async deleteFile(fileId: string): Promise<void> {
    await this.ensureMigration()
    await this.dbStore.removeKeyValue(`whiteboard_file_${fileId}`)
    localStorage.removeItem(`whiteboard_file_${fileId}`)
  }

  public async listFiles(folderId: string): Promise<{ id: string; name: string }[]> {
    await this.ensureMigration()
    const db = await this.dbStore.getDB()
    const list: { id: string; name: string }[] = []

    return new Promise((resolve, reject) => {
      const tx = db.transaction('keyvalue', 'readonly')
      const store = tx.objectStore('keyvalue')
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const key = cursor.key as string
          if (key.startsWith('whiteboard_file_')) {
            const val = cursor.value
            if (val && val.folderId === folderId) {
              list.push({ id: val.id, name: val.name })
            }
          }
          cursor.continue()
        } else {
          // fallback checks
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('whiteboard_file_')) {
              try {
                const val = localStorage.getItem(key)
                if (val) {
                  const fileObj = JSON.parse(val)
                  if (fileObj.folderId === folderId && !list.some((item) => item.id === fileObj.id)) {
                    list.push({ id: fileObj.id, name: fileObj.name })
                  }
                }
              } catch {
                // ignore
              }
            }
          }
          resolve(list)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }
}
