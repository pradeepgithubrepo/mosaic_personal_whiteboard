import { StorageProvider, Board, BoardHeader } from '../../types'

interface CachedFolderIds {
  rootFolderId: string
  boardsFolderId: string
  imagesFolderId: string
  exportsFolderId: string
  markerFileId: string
}

export class GoogleDriveProvider implements StorageProvider {
  public name = 'google-drive'
  private cachedFolders: CachedFolderIds | null = null

  // Retrieves the access token, auto-refreshing it if expired
  private async getValidToken(): Promise<string> {
    const accessToken = localStorage.getItem('whiteboard_oauth_access_token')
    const expiresAtStr = localStorage.getItem('whiteboard_oauth_expires_at')
    const refreshToken = localStorage.getItem('whiteboard_oauth_refresh_token')

    if (!accessToken) {
      throw new Error('Google Drive account is not connected. Please go to Settings and sign in.')
    }

    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0
    // Buffer of 30 seconds before actual expiration
    if (Date.now() < expiresAt - 30 * 1000) {
      return accessToken
    }

    // Attempt token refresh
    if (!refreshToken) {
      throw new Error('OAuth session expired and no refresh token was found. Please sign in again.')
    }

    console.log('Access token expired. Attempting automatic refresh...')
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error('Google credentials missing in environment.')
      }

      const params = new URLSearchParams()
      params.append('client_id', clientId)
      params.append('client_secret', clientSecret)
      params.append('refresh_token', refreshToken)
      params.append('grant_type', 'refresh_token')

      const res = await fetch('/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      if (!res.ok) {
        throw new Error(`Token refresh failed with status ${res.status}`)
      }

      const data = await res.json()
      const newAccessToken = data.access_token
      const newExpiresAt = Date.now() + (data.expires_in || 3600) * 1000

      localStorage.setItem('whiteboard_oauth_access_token', newAccessToken)
      localStorage.setItem('whiteboard_oauth_expires_at', newExpiresAt.toString())
      if (data.refresh_token) {
        localStorage.setItem('whiteboard_oauth_refresh_token', data.refresh_token)
      }

      console.log('Access token successfully refreshed.')
      return newAccessToken
    } catch (e: any) {
      console.error('Failed to refresh access token:', e)
      throw new Error(`OAuth session expired. Details: ${e.message}`)
    }
  }

  // Wrapper for fetching Google Drive API with retry on 401
  private async apiCall(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getValidToken()
    
    const headers = new Headers(options.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    
    const reqOptions = { ...options, headers }
    let res = await fetch(url, reqOptions)

    // Retry once if token refresh somehow didn't sync or token is stale on Google's end
    if (res.status === 401) {
      console.warn('API returned 401. Retrying token refresh...')
      // Clear expires_at to force refresh
      localStorage.setItem('whiteboard_oauth_expires_at', '0')
      const freshToken = await this.getValidToken()
      headers.set('Authorization', `Bearer ${freshToken}`)
      res = await fetch(url, { ...options, headers })
    }

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Google API error (${res.status}): ${errText}`)
    }

    return res
  }

  // Find or create Mosaic workspace
  // Find or leverage existing Mosaic workspace, constructing required subfolders inside it
  public async initializeWorkspace(): Promise<CachedFolderIds> {
    if (this.cachedFolders) return this.cachedFolders

    // Check localStorage cache first
    const cached = localStorage.getItem('whiteboard_gdrive_folder_cache')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        // Verify root folder actually exists in Drive before returning
        await this.apiCall(`https://www.googleapis.com/drive/v3/files/${parsed.rootFolderId}?fields=id`)
        this.cachedFolders = parsed
        return parsed
      } catch {
        localStorage.removeItem('whiteboard_gdrive_folder_cache')
      }
    }

    console.log('Searching for existing Mosaic folder in Google Drive...')
    let rootFolderId = await this.findRootFolder()

    if (!rootFolderId) {
      console.log('No existing Mosaic folder found. Creating root Mosaic folder...')
      rootFolderId = await this.createFolder('Mosaic')
    } else {
      console.log(`Leveraging existing Mosaic folder: ${rootFolderId}`)
    }

    // List all non-trashed items inside the root folder
    const listQuery = encodeURIComponent(`'${rootFolderId}' in parents and trashed = false`)
    const listRes = await this.apiCall(
      `https://www.googleapis.com/drive/v3/files?q=${listQuery}&fields=files(id,name,mimeType)&spaces=drive`
    )
    const listData = await listRes.json()
    const items: Array<{ id: string; name: string; mimeType?: string }> = listData.files || []

    // Locate or create Boards subfolder
    const boardsFolder = items.find(
      (item) => item.mimeType === 'application/vnd.google-apps.folder' && item.name === 'Boards'
    )
    const boardsFolderId = boardsFolder
      ? boardsFolder.id
      : await this.createFolder('Boards', rootFolderId)

    // Locate or create Images subfolder
    const imagesFolder = items.find(
      (item) => item.mimeType === 'application/vnd.google-apps.folder' && item.name === 'Images'
    )
    const imagesFolderId = imagesFolder
      ? imagesFolder.id
      : await this.createFolder('Images', rootFolderId)

    // Locate or create Exports subfolder
    const exportsFolder = items.find(
      (item) => item.mimeType === 'application/vnd.google-apps.folder' && item.name === 'Exports'
    )
    const exportsFolderId = exportsFolder
      ? exportsFolder.id
      : await this.createFolder('Exports', rootFolderId)

    // Locate or create .mosaic marker file inside rootFolderId
    const markerFile = items.find((item) => item.name === '.mosaic')
    let markerFileId: string
    if (markerFile) {
      markerFileId = markerFile.id
    } else {
      const markerContent = JSON.stringify({ app: 'Mosaic', version: 1 })
      markerFileId = await this.uploadFile(rootFolderId, '.mosaic', 'application/json', markerContent)
    }

    const cache: CachedFolderIds = {
      rootFolderId,
      markerFileId,
      boardsFolderId,
      imagesFolderId,
      exportsFolderId,
    }

    this.cachedFolders = cache
    localStorage.setItem('whiteboard_gdrive_folder_cache', JSON.stringify(cache))
    console.log('Mosaic workspace successfully initialized and cached:', cache)
    return cache
  }

  // Helper to create a folder
  private async createFolder(name: string, parentId?: string): Promise<string> {
    const metadata: any = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }
    if (parentId) {
      metadata.parents = [parentId]
    }

    const res = await this.apiCall('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    })

    const folder = await res.json()
    return folder.id
  }

  // Redirect user to Google Sign-In consent screen
  public async authenticate(): Promise<void> {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/callback`

    if (!clientId) {
      throw new Error('Google OAuth client ID not configured in environment.')
    }

    const scope = 'https://www.googleapis.com/auth/drive.file email profile'
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${encodeURIComponent(
      scope
    )}&access_type=offline&prompt=consent`

    window.location.href = authUrl
  }

  // Returns root Mosaic folder ID if found (checking folder name 'Mosaic' first, then '.mosaic' marker)
  public async findRootFolder(): Promise<string | null> {
    // 1. Search for existing folder named 'Mosaic'
    const folderQuery = encodeURIComponent(
      "name = 'Mosaic' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    const folderRes = await this.apiCall(
      `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&spaces=drive`
    )
    const folderData = await folderRes.json()
    const mosaicFolders = folderData.files || []

    if (mosaicFolders.length > 0) {
      return mosaicFolders[0].id
    }

    // 2. Search for '.mosaic' marker file in case parent folder was renamed
    const markerQuery = encodeURIComponent(
      "name = '.mosaic' and mimeType = 'application/json' and trashed = false"
    )
    const markerRes = await this.apiCall(
      `https://www.googleapis.com/drive/v3/files?q=${markerQuery}&fields=files(id,parents)&spaces=drive`
    )
    const markerData = await markerRes.json()
    const markerFiles = markerData.files || []

    if (markerFiles.length > 0 && markerFiles[0].parents?.[0]) {
      return markerFiles[0].parents[0]
    }

    return null
  }

  public async createRootFolder(): Promise<string> {
    const existingId = await this.findRootFolder()
    if (existingId) {
      return existingId
    }
    return this.createFolder('Mosaic')
  }

  public async uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    content: string | Blob
  ): Promise<string> {
    const metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: [folderId],
    }

    const boundary = 'mosaic_upload_boundary'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const header = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}${delimiter}Content-Type: ${mimeType}\r\n\r\n`

    let bodyBlob: Blob
    if (content instanceof Blob) {
      bodyBlob = new Blob([header, content, closeDelimiter], {
        type: `multipart/related; boundary=${boundary}`,
      })
    } else {
      bodyBlob = new Blob([header, content, closeDelimiter], {
        type: `multipart/related; boundary=${boundary}`,
      })
    }

    const res = await this.apiCall(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: bodyBlob,
      }
    )

    const file = await res.json()
    return file.id
  }

  public async downloadFile(fileId: string): Promise<string> {
    const res = await this.apiCall(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
    return res.text()
  }

  public async updateFile(fileId: string, content: string | Blob): Promise<void> {
    let bodyData: any = content
    let mimeType = 'text/plain'

    if (content instanceof Blob) {
      mimeType = content.type
    } else if (typeof content === 'string') {
      try {
        JSON.parse(content)
        mimeType = 'application/json'
      } catch {
        mimeType = 'text/plain'
      }
    }

    await this.apiCall(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': mimeType,
        },
        body: bodyData,
      }
    )
  }

  public async deleteFile(fileId: string): Promise<void> {
    await this.apiCall(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
    })
  }

  public async listFiles(folderId: string): Promise<{ id: string; name: string }[]> {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const res = await this.apiCall(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`
    )
    const data = await res.json()
    return data.files || []
  }

  // Board CRUD Implementation using human-readable filenames: [title]__[id].json
  public async saveBoard(board: Board): Promise<void> {
    const { boardsFolderId } = await this.initializeWorkspace()

    // 1. Search for existing file containing the board's ID in the filename
    const query = encodeURIComponent(`'${boardsFolderId}' in parents and name contains '__${board.id}.json' and trashed = false`)
    const res = await this.apiCall(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`)
    const searchData = await res.json()
    const files = searchData.files || []

    const targetFileName = `${board.title}__${board.id}.json`
    const boardContent = JSON.stringify(board)

    if (files.length > 0) {
      const existingFile = files[0]
      // Rename if title changed
      if (existingFile.name !== targetFileName) {
        await this.apiCall(`https://www.googleapis.com/drive/v3/files/${existingFile.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetFileName }),
        })
      }
      // Update content
      await this.updateFile(existingFile.id, boardContent)
    } else {
      // Create new file
      await this.uploadFile(boardsFolderId, targetFileName, 'application/json', boardContent)
    }
  }

  public async loadBoard(id: string): Promise<Board | null> {
    const { boardsFolderId } = await this.initializeWorkspace()
    const query = encodeURIComponent(`'${boardsFolderId}' in parents and name contains '__${id}.json' and trashed = false`)
    const res = await this.apiCall(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`)
    const searchData = await res.json()
    const files = searchData.files || []

    if (files.length === 0) return null

    const fileContent = await this.downloadFile(files[0].id)
    try {
      return JSON.parse(fileContent)
    } catch {
      return null
    }
  }

  public async deleteBoard(id: string): Promise<void> {
    const { boardsFolderId } = await this.initializeWorkspace()
    const query = encodeURIComponent(`'${boardsFolderId}' in parents and name contains '__${id}.json' and trashed = false`)
    const res = await this.apiCall(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`)
    const searchData = await res.json()
    const files = searchData.files || []

    if (files.length > 0) {
      await this.deleteFile(files[0].id)
    }
  }

  public async listBoards(): Promise<BoardHeader[]> {
    try {
      const { boardsFolderId } = await this.initializeWorkspace()
      const query = encodeURIComponent(`'${boardsFolderId}' in parents and name contains '__' and name contains '.json' and trashed = false`)
      
      const res = await this.apiCall(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime,modifiedTime)&spaces=drive`
      )
      const data = await res.json()
      const files = data.files || []

      const headers: BoardHeader[] = files.map((file: any) => {
        // Parse fileName "[Title]__[UUID].json"
        const nameWithoutExt = file.name.slice(0, -5) // remove ".json"
        const splitIdx = nameWithoutExt.lastIndexOf('__')
        
        let title = file.name
        let id = file.id

        if (splitIdx > -1) {
          title = nameWithoutExt.substring(0, splitIdx)
          id = nameWithoutExt.substring(splitIdx + 2)
        }

        return {
          id,
          title,
          createdAt: file.createdTime,
          updatedAt: file.modifiedTime,
        }
      })

      return headers
    } catch (e) {
      console.error('Failed to list boards from Google Drive:', e)
      // Throwing error prompts settings login or fails gracefully rather than crashing silent
      throw e
    }
  }

  // Simulated assets - mapping assets to the Images/ folder in Google Drive
  public async uploadAsset(fileName: string, mimeType: string, data: Blob): Promise<string> {
    const { imagesFolderId } = await this.initializeWorkspace()
    return this.uploadFile(imagesFolderId, fileName, mimeType, data)
  }

  public async downloadAsset(assetId: string): Promise<Blob> {
    const cleanId = assetId.replace(/^asset-id:\/\//, '')
    if (cleanId.startsWith('local_asset_')) {
      const raw = localStorage.getItem(`whiteboard_asset_${cleanId}`)
      if (raw) {
        const { mimeType, data } = JSON.parse(raw)
        const base64Content = data.split(',')[1]
        const binary = atob(base64Content)
        const array = []
        for (let i = 0; i < binary.length; i++) {
          array.push(binary.charCodeAt(i))
        }
        return new Blob([new Uint8Array(array)], { type: mimeType })
      }
    }
    const res = await this.apiCall(`https://www.googleapis.com/drive/v3/files/${cleanId}?alt=media`)
    return res.blob()
  }

  public async deleteAsset(assetId: string): Promise<void> {
    const cleanId = assetId.replace(/^asset-id:\/\//, '')
    await this.deleteFile(cleanId)
  }
}
