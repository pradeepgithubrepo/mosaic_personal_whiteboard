import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Board, BoardHeader, StorageProvider } from '../types'
import { BoardRepository } from './BoardRepository'
import { LocalProvider } from './providers/LocalProvider'
import { GoogleDriveProvider } from './providers/GoogleDriveProvider'

interface BoardContextType {
  activeBoard: Board | null
  boards: BoardHeader[]
  loading: boolean
  saving: boolean
  providerName: string
  setProviderName: (name: 'local' | 'google-drive') => void
  selectBoard: (id: string) => Promise<Board | null>
  createBoard: (title: string) => Promise<Board>
  renameBoard: (id: string, title: string) => Promise<void>
  deleteBoard: (id: string) => Promise<void>
  duplicateBoard: (id: string, newTitle?: string) => Promise<Board>
  saveActiveBoardElements: (elements: any) => void
  refreshBoardsList: () => Promise<void>
  repository: BoardRepository
  downloadAsset: (assetId: string) => Promise<Blob>
  uploadAsset: (fileName: string, mimeType: string, data: Blob) => Promise<string>
}

const BoardContext = createContext<BoardContextType | undefined>(undefined)

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [providerName, setProviderNameState] = useState<'local' | 'google-drive'>(() => {
    const saved = localStorage.getItem('whiteboard_storage_provider')
    return (saved as 'local' | 'google-drive') || 'local'
  })

  // Instantiate providers
  const localProvider = useRef(new LocalProvider())
  const gdProvider = useRef(new GoogleDriveProvider())
  
  // Instantiate Repository
  const repositoryRef = useRef<BoardRepository>(
    new BoardRepository(providerName === 'local' ? localProvider.current : gdProvider.current)
  )

  const [boards, setBoards] = useState<BoardHeader[]>([])
  const [activeBoard, setActiveBoard] = useState<Board | null>(null)
  const activeBoardRef = useRef<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<number | null>(null)

  // Keep activeBoardRef in sync with state
  useEffect(() => {
    activeBoardRef.current = activeBoard
  }, [activeBoard])

  // Switch providers when user updates settings
  const setProviderName = (name: 'local' | 'google-drive') => {
    setProviderNameState(name)
    localStorage.setItem('whiteboard_storage_provider', name)
    const provider: StorageProvider = name === 'local' ? localProvider.current : gdProvider.current
    repositoryRef.current.setProvider(provider)
    refreshBoardsList()
    // Close active board as provider changed
    setActiveBoard(null)
  }

  // Refresh lists
  const refreshBoardsList = async () => {
    setLoading(true)
    try {
      const list = await repositoryRef.current.list()
      setBoards(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    } catch (e) {
      console.error('Failed to load board list:', e)
      setBoards([])
    } finally {
      setLoading(false)
    }
  }

  // Load initial lists on mount
  useEffect(() => {
    refreshBoardsList()
    // Open the last active board if it exists
    const lastActiveId = localStorage.getItem('whiteboard_last_active_id')
    if (lastActiveId) {
      selectBoard(lastActiveId)
    }
  }, [providerName])

  // Select/Open a board
  const selectBoard = async (id: string): Promise<Board | null> => {
    setLoading(true)
    try {
      const board = await repositoryRef.current.load(id)
      if (board) {
        setActiveBoard(board)
        activeBoardRef.current = board
        localStorage.setItem('whiteboard_last_active_id', id)
        return board
      }
      return null
    } catch (e) {
      console.error(`Failed to load board ${id}:`, e)
      return null
    } finally {
      setLoading(false)
    }
  }

  // Create a new board
  const createBoard = async (title: string): Promise<Board> => {
    const now = new Date().toISOString()
    const newBoard: Board = {
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      elements: [],
    }
    
    await repositoryRef.current.save(newBoard)
    await refreshBoardsList()
    setActiveBoard(newBoard)
    activeBoardRef.current = newBoard
    localStorage.setItem('whiteboard_last_active_id', newBoard.id)
    return newBoard
  }

  // Rename a board
  const renameBoard = async (id: string, title: string): Promise<void> => {
    if (activeBoard && activeBoard.id === id) {
      const updated = { ...activeBoard, title, updatedAt: new Date().toISOString() }
      setActiveBoard(updated)
      activeBoardRef.current = updated
      await repositoryRef.current.save(updated)
    } else {
      const board = await repositoryRef.current.load(id)
      if (board) {
        board.title = title
        board.updatedAt = new Date().toISOString()
        await repositoryRef.current.save(board)
      }
    }
    await refreshBoardsList()
  }

  // Delete a board
  const deleteBoard = async (id: string): Promise<void> => {
    await repositoryRef.current.delete(id)
    if (activeBoard && activeBoard.id === id) {
      setActiveBoard(null)
      activeBoardRef.current = null
      localStorage.removeItem('whiteboard_last_active_id')
    }
    await refreshBoardsList()
  }

  // Duplicate a board
  const duplicateBoard = async (id: string, newTitle?: string): Promise<Board> => {
    const dup = await repositoryRef.current.duplicate(id, newTitle)
    await refreshBoardsList()
    return dup
  }

  // Save active board elements with debouncing (auto-save)
  const saveActiveBoardElements = (elements: any) => {
    const currentBoard = activeBoardRef.current
    if (!currentBoard) return

    // Update active board ref in memory instantly (prevents high-frequency React re-renders while drawing)
    const updatedBoard = { ...currentBoard, elements }
    activeBoardRef.current = updatedBoard
    setSaving(true)

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const boardToSave = activeBoardRef.current
      if (boardToSave) {
        try {
          const finalBoard: Board = {
            ...boardToSave,
            updatedAt: new Date().toISOString(),
          }
          await repositoryRef.current.save(finalBoard)
          // Keep ref current with the persisted updatedAt timestamp
          // NOTE: Do NOT call setActiveBoard here — that would trigger a React
          // re-render cascade which remounts Tldraw and clears the canvas.
          activeBoardRef.current = finalBoard
          // Update the sidebar metadata list to show new updatedAt
          setBoards((prev) =>
            prev.map((b) =>
              b.id === finalBoard.id ? { ...b, updatedAt: finalBoard.updatedAt } : b
            )
          )
        } catch (e) {
          console.error('Failed to auto-save board elements:', e)
        } finally {
          setSaving(false)
        }
      }
    }, 1000) // 1 second debounce
  }

  const downloadAsset = async (assetId: string): Promise<Blob> => {
    return repositoryRef.current.getProvider().downloadAsset(assetId)
  }

  const uploadAsset = async (fileName: string, mimeType: string, data: Blob): Promise<string> => {
    return repositoryRef.current.getProvider().uploadAsset(fileName, mimeType, data)
  }

  return (
    <BoardContext.Provider
      value={{
        activeBoard,
        boards,
        loading,
        saving,
        providerName,
        setProviderName,
        selectBoard,
        createBoard,
        renameBoard,
        deleteBoard,
        duplicateBoard,
        saveActiveBoardElements,
        refreshBoardsList,
        repository: repositoryRef.current,
        downloadAsset,
        uploadAsset,
      }}
    >
      {children}
    </BoardContext.Provider>
  )
}

export const useBoard = () => {
  const context = useContext(BoardContext)
  if (context === undefined) {
    throw new Error('useBoard must be used within a BoardProvider')
  }
  return context
}
