import { Board, BoardHeader, StorageProvider } from '../types'

export class BoardRepository {
  private provider: StorageProvider

  constructor(initialProvider: StorageProvider) {
    this.provider = initialProvider
  }

  public setProvider(provider: StorageProvider): void {
    this.provider = provider
  }

  public getProvider(): StorageProvider {
    return this.provider
  }

  public async list(): Promise<BoardHeader[]> {
    return this.provider.listBoards()
  }

  public async load(id: string): Promise<Board | null> {
    return this.provider.loadBoard(id)
  }

  public async save(board: Board): Promise<void> {
    const updatedBoard = {
      ...board,
      updatedAt: new Date().toISOString(),
    }
    return this.provider.saveBoard(updatedBoard)
  }

  public async delete(id: string): Promise<void> {
    return this.provider.deleteBoard(id)
  }

  public async duplicate(id: string, newTitle?: string): Promise<Board> {
    const sourceBoard = await this.load(id)
    if (!sourceBoard) {
      throw new Error(`Cannot duplicate board: Source board ${id} not found.`)
    }

    const duplicatedId = crypto.randomUUID()
    const now = new Date().toISOString()
    const duplicatedBoard: Board = {
      ...sourceBoard,
      id: duplicatedId,
      title: newTitle || `Copy of ${sourceBoard.title}`,
      createdAt: now,
      updatedAt: now,
    }

    await this.save(duplicatedBoard)
    return duplicatedBoard
  }
}
