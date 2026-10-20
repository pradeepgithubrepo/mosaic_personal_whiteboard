import { Board, BoardHeader, StorageProvider } from '../../types'

const STAGED_BOARD_KEY_PREFIX = 'mosaic_github_staged_board_'
const GITHUB_SYNC_ENDPOINT = '/.netlify/functions/github-boards'

interface GitHubResponse {
  boards?: BoardHeader[]
  board?: Board
  commitSha?: string
  content?: string
  error?: string
  conflict?: boolean
}

export class GitHubProvider implements StorageProvider {
  public name = 'github'

  private async request(payload: Record<string, unknown>): Promise<GitHubResponse> {
    let response: Response
    try {
      response = await fetch(GITHUB_SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Unable to reach the GitHub sync service: ${message}`)
    }

    const data = (await response.json().catch(() => ({}))) as GitHubResponse
    if (!response.ok) {
      const conflictHint = data.conflict ? ' Reload the board before saving again.' : ''
      throw new Error(`${data.error || 'GitHub sync failed.'} (${response.status})${conflictHint}`)
    }
    return data
  }

  private getStagedBoard(id: string): Board | null {
    const raw = localStorage.getItem(`${STAGED_BOARD_KEY_PREFIX}${id}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Board
    } catch {
      localStorage.removeItem(`${STAGED_BOARD_KEY_PREFIX}${id}`)
      return null
    }
  }

  private getStagedBoards(): Board[] {
    const boards: Board[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(STAGED_BOARD_KEY_PREFIX)) continue
      const board = this.getStagedBoard(key.slice(STAGED_BOARD_KEY_PREFIX.length))
      if (board) boards.push(board)
    }
    return boards
  }

  public async saveBoard(board: Board): Promise<void> {
    localStorage.setItem(`${STAGED_BOARD_KEY_PREFIX}${board.id}`, JSON.stringify(board))
  }

  public async commitBoard(board: Board): Promise<string> {
    const data = await this.request({ action: 'commit', board })
    localStorage.removeItem(`${STAGED_BOARD_KEY_PREFIX}${board.id}`)
    return data.commitSha || ''
  }

  private async hydrateBoardAssets(board: Board): Promise<Board> {
    const files = board.elements?.files
    if (!files) return board

    await Promise.all(
      Object.values(files).map(async (file: any) => {
        if (!file?.mosaicAssetPath || file.dataURL) return
        const data = await this.request({ action: 'loadAsset', path: file.mosaicAssetPath })
        if (!data.content) {
          throw new Error(`GitHub asset ${file.mosaicAssetPath} is empty.`)
        }
        file.dataURL = `data:${file.mimeType || 'application/octet-stream'};base64,${data.content}`
      })
    )

    return board
  }

  public async loadBoard(id: string): Promise<Board | null> {
    const staged = this.getStagedBoard(id)
    if (staged) return staged

    try {
      const data = await this.request({ action: 'load', id })
      return data.board ? this.hydrateBoardAssets(data.board) : null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('(404)')) return null
      throw error
    }
  }

  public async deleteBoard(id: string): Promise<void> {
    localStorage.removeItem(`${STAGED_BOARD_KEY_PREFIX}${id}`)
    await this.request({ action: 'delete', id })
  }

  public async listBoards(): Promise<BoardHeader[]> {
    const data = await this.request({ action: 'list' })
    const byId = new Map((data.boards || []).map((board) => [board.id, board]))

    for (const board of this.getStagedBoards()) {
      byId.set(board.id, {
        id: board.id,
        title: board.title,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        thumbnail: board.thumbnail,
      })
    }

    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  public async uploadAsset(): Promise<string> {
    throw new Error('GitHub sync stores board assets inside the board file. Uploading standalone assets is not supported.')
  }

  public async downloadAsset(): Promise<Blob> {
    throw new Error('GitHub sync stores board assets inside the board file. Downloading standalone assets is not supported.')
  }

  public async deleteAsset(): Promise<void> {
    throw new Error('GitHub sync stores board assets inside the board file. Deleting standalone assets is not supported.')
  }

  public async authenticate(): Promise<void> {
    await this.request({ action: 'list' })
  }

  public async findRootFolder(): Promise<string | null> {
    return '.mosaic'
  }

  public async createRootFolder(): Promise<string> {
    return '.mosaic'
  }

  public async uploadFile(): Promise<string> {
    throw new Error('GitHub sync only supports Mosaic board files.')
  }

  public async downloadFile(): Promise<string> {
    throw new Error('GitHub sync only supports Mosaic board files.')
  }

  public async updateFile(): Promise<void> {
    throw new Error('GitHub sync only supports Mosaic board files.')
  }

  public async deleteFile(): Promise<void> {
    throw new Error('GitHub sync only supports Mosaic board files.')
  }

  public async listFiles(): Promise<{ id: string; name: string }[]> {
    throw new Error('GitHub sync only supports Mosaic board files.')
  }
}
