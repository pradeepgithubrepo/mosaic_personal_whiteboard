import React, { createContext, useContext, useEffect, useState, useRef, startTransition } from 'react'
import { Board, BoardHeader, ExcalidrawScene, StorageProvider } from '../types'
import { BoardRepository } from './BoardRepository'
import { LocalProvider } from './providers/LocalProvider'
import { GoogleDriveProvider } from './providers/GoogleDriveProvider'
import { GitHubProvider } from './providers/GitHubProvider'

interface BoardContextType {
  activeBoard: Board | null
  boards: BoardHeader[]
  boardsLoaded: boolean
  loading: boolean
  saving: boolean
  providerName: string
  setProviderName: (name: 'local' | 'google-drive' | 'github') => void
  selectBoard: (id: string) => Promise<Board | null>
  createBoard: (title: string) => Promise<Board>
  renameBoard: (id: string, title: string) => Promise<void>
  deleteBoard: (id: string) => Promise<void>
  duplicateBoard: (id: string, newTitle?: string) => Promise<Board>
  saveActiveBoardElements: (elements: any) => void
  commitActiveBoard: (elements?: ExcalidrawScene) => Promise<void>
  refreshBoardsList: () => Promise<void>
  repository: BoardRepository
  // Asset helpers kept for ImportModal / importers that still need Drive asset storage
  downloadAsset: (assetId: string) => Promise<Blob>
  uploadAsset: (fileName: string, mimeType: string, data: Blob) => Promise<string>
}

const BoardContext = createContext<BoardContextType | undefined>(undefined)

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [providerName, setProviderNameState] = useState<'local' | 'google-drive' | 'github'>(() => {
    const saved = localStorage.getItem('whiteboard_storage_provider')
    return (saved as 'local' | 'google-drive' | 'github') || 'local'
  })

  const localProvider = useRef(new LocalProvider())
  const gdProvider = useRef(new GoogleDriveProvider())
  const githubProvider = useRef(new GitHubProvider())

  const repositoryRef = useRef<BoardRepository>(
    new BoardRepository(
      providerName === 'local'
        ? localProvider.current
        : providerName === 'google-drive'
          ? gdProvider.current
          : githubProvider.current
    )
  )

  const [boards, setBoards] = useState<BoardHeader[]>([])
  // False until the board list for the current provider has been fetched (or failed),
  // so the canvas can tell "still loading" apart from "this provider has no boards".
  const [boardsLoaded, setBoardsLoaded] = useState(false)
  // Ignores list responses from a provider the user has already switched away from.
  const listRequestRef = useRef(0)
  const [activeBoard, setActiveBoard] = useState<Board | null>(null)
  const activeBoardRef = useRef<Board | null>(null)
  // Only true while selectBoard is fetching. Starting at false matters: boards opened
  // without selectBoard (e.g. createBoard) would otherwise never clear the spinner.
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<number | null>(null)
  // Gates setSaving(true) so we don't cascade re-renders through the entire context tree
  // on every individual draw stroke.
  const isSavingRef = useRef(false)

  // Keep activeBoardRef in sync with React state
  useEffect(() => {
    activeBoardRef.current = activeBoard
  }, [activeBoard])

  // Switch storage providers (Settings panel)
  const setProviderName = (name: 'local' | 'google-drive' | 'github') => {
    setProviderNameState(name)
    localStorage.setItem('whiteboard_storage_provider', name)
    const provider: StorageProvider =
      name === 'local'
        ? localProvider.current
        : name === 'google-drive'
          ? gdProvider.current
          : githubProvider.current
    repositoryRef.current.setProvider(provider)
    setBoardsLoaded(false)
    refreshBoardsList()
    setActiveBoard(null)
  }

  // Refresh the sidebar board list.
  // Does NOT touch the loading spinner — loading is only for board CONTENT loads.
  const refreshBoardsList = async () => {
    const requestId = ++listRequestRef.current
    try {
      const list = await repositoryRef.current.list()
      if (requestId !== listRequestRef.current) return
      setBoards(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    } catch (e) {
      if (requestId !== listRequestRef.current) return
      console.error('Failed to load board list:', e)
      setBoards([])
    } finally {
      if (requestId === listRequestRef.current) setBoardsLoaded(true)
    }
  }

  // Load the initial board list on mount (or when provider changes).
  // Board CONTENT loading is handled exclusively by CanvasPage via URL route params
  // to avoid the race condition where both this effect and CanvasPage call selectBoard
  // concurrently, causing multiple setLoading flips and canvas blanks.
  useEffect(() => {
    refreshBoardsList()
  }, [providerName])

  // Select / open a board by ID
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

  // Create a blank board (elements: null = Excalidraw starts with empty canvas)
  const createBoard = async (title: string): Promise<Board> => {
    const now = new Date().toISOString()
    const newBoard: Board = {
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      elements: null,
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

  // Debounced auto-save — called from CanvasPage's onChange handler
  const saveActiveBoardElements = (elements: ExcalidrawScene) => {
    const currentBoard = activeBoardRef.current
    if (!currentBoard) return

    // Update ref immediately so the next save timeout reads the latest scene
    activeBoardRef.current = { ...currentBoard, elements }

    // Fire setSaving(true) only once per save cycle to avoid per-stroke re-renders
    if (!isSavingRef.current) {
      isSavingRef.current = true
      setSaving(true)
    }

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
          activeBoardRef.current = finalBoard
          // Use startTransition so the low-priority state update doesn't interrupt
          // ongoing user interactions (strokes, panning, etc.)
          startTransition(() => {
            setActiveBoard(finalBoard)
            setBoards((prev) =>
              prev.map((b) =>
                b.id === finalBoard.id ? { ...b, updatedAt: finalBoard.updatedAt } : b
              )
            )
          })
        } catch (e) {
          console.error('Failed to auto-save board elements:', e)
        } finally {
          isSavingRef.current = false
          setSaving(false)
        }
      }
    }, 1000)
  }

  const commitActiveBoard = async (elements?: ExcalidrawScene): Promise<void> => {
    const currentBoard = activeBoardRef.current
    if (!currentBoard) {
      throw new Error('No active board to commit.')
    }
    if (!(repositoryRef.current.getProvider() instanceof GitHubProvider)) {
      throw new Error('Select GitHub Repository storage before committing a board.')
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }

    const boardToCommit: Board = {
      ...currentBoard,
      ...(elements ? { elements } : {}),
      updatedAt: new Date().toISOString(),
    }

    isSavingRef.current = true
    setSaving(true)
    try {
      // Stage first so a failed commit remains recoverable in this browser.
      await repositoryRef.current.save(boardToCommit)
      await githubProvider.current.commitBoard(boardToCommit)
      activeBoardRef.current = boardToCommit
      setActiveBoard(boardToCommit)
      setBoards((previous) =>
        previous.map((board) =>
          board.id === boardToCommit.id
            ? { ...board, updatedAt: boardToCommit.updatedAt, title: boardToCommit.title }
            : board
        )
      )
    } finally {
      isSavingRef.current = false
      setSaving(false)
    }
  }

  // Asset helpers (used by the import system for Drive-based asset storage)
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
        boardsLoaded,
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
        commitActiveBoard,
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
