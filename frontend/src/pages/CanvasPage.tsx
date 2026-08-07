import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { Plus, MousePointer } from 'lucide-react'
import { useBoard } from '../hooks/useBoard'
import { useTheme } from '../hooks/useTheme'
import type { ExcalidrawScene } from '../types'

import '@excalidraw/excalidraw/index.css'

// Debounce helper — avoids saving on every single stroke
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

export const CanvasPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeBoard, selectBoard, createBoard, saveActiveBoardElements, loading, boards } =
    useBoard()
  const { resolvedTheme } = useTheme()

  // Imperative API ref — available if we ever need programmatic scene control
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)

  // Keep saveActiveBoardElements stable in ref so the debounced onChange
  // callback never goes stale without being recreated.
  const saveRef = useRef(saveActiveBoardElements)
  saveRef.current = saveActiveBoardElements

  // ─── Board selection from URL param ─────────────────────────────────────
  // Deps: only id (URL) and activeBoard?.id.
  // boards.length is intentionally excluded — sidebar list refreshes must NOT
  // trigger a board reload and cause a double-mount race.
  useEffect(() => {
    if (id) {
      if (!activeBoard || activeBoard.id !== id) {
        selectBoard(id)
      }
    } else {
      const lastActiveId = localStorage.getItem('whiteboard_last_active_id')
      if (lastActiveId) {
        navigate(`/board/${lastActiveId}`, { replace: true })
      } else if (boards.length > 0) {
        navigate(`/board/${boards[0].id}`, { replace: true })
      }
    }
  }, [id, activeBoard?.id])

  // ─── initialData ─────────────────────────────────────────────────────────
  // Passed to <Excalidraw initialData={...}> once on mount (key={activeBoard.id}
  // guarantees a fresh mount when the board changes). This replaces the old
  // async loadSnapshot-inside-handleMount approach that was racing with effects.
  const initialData = useMemo<ExcalidrawScene>(() => {
    if (!activeBoard?.elements) {
      return { elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} }
    }
    return activeBoard.elements
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard?.id]) // recompute only on board switch, not on every save

  // ─── onChange handler ─────────────────────────────────────────────────────
  // Single source of truth for saving — replaces the old store.listen approach.
  // Debounced at 1 s to match the previous save cadence.
  const handleChange = useCallback(
    debounce(
      (
        elements: readonly any[],
        appState: Record<string, any>,
        files: Record<string, any>
      ) => {
        const scene: ExcalidrawScene = {
          elements: [...elements],
          // Persist only the fields we care about (trim volatile appState keys)
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff',
            gridSize: appState.gridSize ?? null,
            theme: appState.theme ?? 'light',
          },
          files: files ?? {},
        }
        saveRef.current(scene)
      },
      1000
    ),
    []
  )

  const handleCreateBoard = async () => {
    const title = `My Whiteboard ${boards.length + 1}`
    const newBoard = await createBoard(title)
    navigate(`/board/${newBoard.id}`)
  }

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 bg-white dark:bg-[#0b0f19] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Loading Canvas...</span>
        </div>
      </div>
    )
  }

  // ─── No board selected ────────────────────────────────────────────────────
  if (!activeBoard) {
    return (
      <div className="flex-1 bg-gray-50 dark:bg-[#0b0f19] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white dark:bg-[#0f172a] border border-gray-250 dark:border-gray-800 rounded-3xl p-8 shadow-sm flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
            <MousePointer className="w-6 h-6 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">No active board selected</h3>
          <p className="text-sm text-gray-550 dark:text-gray-400 mt-2 leading-relaxed">
            Create a fresh whiteboard canvas to draw freely, make sticky notes, and plan ideas.
          </p>
          <button
            onClick={handleCreateBoard}
            className="mt-6 py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Whiteboard</span>
          </button>
        </div>
      </div>
    )
  }

  // ─── Canvas ───────────────────────────────────────────────────────────────
  // key={activeBoard.id} causes Excalidraw to fully remount when switching boards,
  // ensuring initialData is re-applied cleanly for the new board.
  return (
    <div className="flex-1 relative h-full w-full" key={activeBoard.id}>
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawAPIRef.current = api }}
        initialData={initialData}
        onChange={handleChange}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        UIOptions={{
          canvasActions: {
            export: false,
            saveToActiveFile: false,
            loadScene: false,
          },
        }}
      />
    </div>
  )
}

export default CanvasPage
