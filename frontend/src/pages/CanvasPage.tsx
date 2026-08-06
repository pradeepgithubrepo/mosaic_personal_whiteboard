import React, { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tldraw, Editor, loadSnapshot, getSnapshot } from 'tldraw'
import { Plus, MousePointer } from 'lucide-react'
import { useBoard } from '../hooks/useBoard'
import { useTheme } from '../hooks/useTheme'
import type { ImportResult } from '../services/import/importers/ImageImporter'

// Returns true if the stored elements are an ImportResult rather than a tldraw snapshot
function isImportResult(elements: any): elements is ImportResult {
  return elements && elements._importResult === true
}

// Build tldraw asset + shape records from an ImportResult using the Editor API
async function applyImportResult(editor: Editor, result: ImportResult) {
  const { importedAssets, importedShapes } = result

  // 1. Register one TLImageAsset per uploaded file
  const tlAssets = importedAssets.map((a) => {
    const cleanStorageId = a.assetId.replace(/^asset-id:\/\//, '')
    return {
      id: `asset:${cleanStorageId}` as any,
      typeName: 'asset' as const,
      type: 'image' as const,
      props: {
        name: a.fileName,
        src: a.src, // blob URL — valid for current session
        w: a.width,
        h: a.height,
        mimeType: a.mimeType,
        isAnimated: false,
      },
      meta: {
        storageAssetId: cleanStorageId, // store original ID for future reload
      },
    }
  })

  editor.createAssets(tlAssets)

  // 2. Create one locked image shape per asset
  const tlShapes = importedShapes.map((s) => {
    const cleanStorageId = s.assetId.replace(/^asset-id:\/\//, '')
    return {
      type: 'image' as const,
      x: s.x,
      y: s.y,
      rotation: s.rotation || 0,
      isLocked: true,
      props: {
        assetId: `asset:${cleanStorageId}` as any,
        w: s.width,
        h: s.height,
      },
      meta: s.meta || {},
    }
  })

  editor.createShapes(tlShapes)

  // 3. Fit all content into view
  editor.zoomToFit({ animation: { duration: 400 } })
}

// Helper to extract valid tldraw snapshot containing store
function normalizeSnapshot(snapshot: any): any {
  if (!snapshot) return snapshot
  if (snapshot.document?.store) {
    return snapshot.document
  }
  return snapshot
}

// Resolve asset-id:// references in a persisted snapshot back to blob URLs
async function resolveSnapshotAssets(rawSnapshot: any, downloadAsset: (id: string) => Promise<Blob>): Promise<any> {
  const snapshot = normalizeSnapshot(rawSnapshot)
  const store = snapshot?.store || {}
  const promises = Object.keys(store).map(async (key) => {
    const record = store[key]
    if (record?.typeName === 'asset' && record?.type === 'image') {
      const src: string = record.props?.src || ''
      // If src is already a valid blob or HTTP URL, keep it intact
      if (src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
        return
      }
      // Resolve both asset-id:// (new scheme) and storageAssetId meta
      let storageId: string | null = record.meta?.storageAssetId || null
      if (!storageId && src.startsWith('asset-id://')) {
        storageId = src.replace('asset-id://', '')
      }
      if (storageId) {
        const cleanStorageId = storageId.replace(/^asset-id:\/\//, '')
        try {
          const blob = await downloadAsset(cleanStorageId)
          const targetMime = record.props?.mimeType || (blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png')
          const imageBlob = (blob.type && blob.type.startsWith('image/'))
            ? blob
            : new Blob([await blob.arrayBuffer()], { type: targetMime })
          record.props.src = URL.createObjectURL(imageBlob)
          record.meta = { ...record.meta, storageAssetId: cleanStorageId }
        } catch (err) {
          console.warn(`Could not resolve asset ${cleanStorageId}:`, err)
        }
      }
    }
  })
  await Promise.all(promises)
  return snapshot
}

// Strip blob: URLs back to asset-id:// before persistence
function cleanSnapshotForStorage(rawSnapshot: any): any {
  if (!rawSnapshot) return rawSnapshot
  const snapshot = normalizeSnapshot(rawSnapshot)
  const clean = JSON.parse(JSON.stringify(snapshot))
  const store = clean?.store || {}
  Object.keys(store).forEach((key) => {
    const record = store[key]
    if (record?.typeName === 'asset' && record?.type === 'image') {
      let storageId = record.meta?.storageAssetId
      if (!storageId && record.props?.src?.startsWith('asset-id://')) {
        storageId = record.props.src.replace('asset-id://', '')
      }
      if (storageId) {
        const cleanStorageId = storageId.replace(/^asset-id:\/\//, '')
        record.meta = { ...record.meta, storageAssetId: cleanStorageId }
        if (record.props?.src?.startsWith('blob:')) {
          record.props.src = `asset-id://${cleanStorageId}`
        }
      }
    }
  })
  return clean
}

export const CanvasPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeBoard, selectBoard, createBoard, saveActiveBoardElements, loading, boards, downloadAsset } = useBoard()
  const { resolvedTheme } = useTheme()

  const disposeRef = useRef<(() => void) | null>(null)

  // Keep these refs current synchronously during every render.
  // Updating refs in the render body (not in a useEffect) guarantees that
  // tldraw's internal onMount — which fires inside a useLayoutEffect before
  // parent useEffects have run — always reads the latest values.
  const activeBoardRef = useRef(activeBoard)
  activeBoardRef.current = activeBoard
  const downloadAssetRef = useRef(downloadAsset)
  downloadAssetRef.current = downloadAsset
  const saveActiveBoardElementsRef = useRef(saveActiveBoardElements)
  saveActiveBoardElementsRef.current = saveActiveBoardElements

  // Sync route param with active board selection.
  // Deps: only id (URL) and activeBoard?.id (board switch) — NOT boards.length.
  // boards.length changes when the sidebar list refreshes and must NOT trigger a board reload.
  useEffect(() => {
    if (id) {
      if (!activeBoard || activeBoard.id !== id) {
        console.log(`[CanvasPage] useEffect[id,activeBoard?.id] -> selectBoard(${id}), reason: activeBoard=${activeBoard?.id ?? 'null'}`)
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

  // Dispose the store listener when the active board changes or on unmount.
  // A fresh listener is always registered inside handleMount on the new editor instance.
  useEffect(() => {
    return () => {
      if (disposeRef.current) {
        disposeRef.current()
        disposeRef.current = null
      }
    }
  }, [activeBoard?.id])

  const handleMount = React.useCallback((editor: Editor) => {
    const currentBoard = activeBoardRef.current
    console.log(`[CanvasPage] handleMount fired, board=${currentBoard?.id ?? 'null'}, elements type=${currentBoard?.elements ? (Array.isArray(currentBoard.elements) ? 'array('+currentBoard.elements.length+')' : 'object('+Object.keys(currentBoard.elements).length+' keys)') : 'null/undefined'}`)

    // Always (re-)load board content into this editor instance.
    if (currentBoard) {
      const initBoard = async () => {
        if (currentBoard.elements && Object.keys(currentBoard.elements).length > 0) {
          try {
            if (isImportResult(currentBoard.elements)) {
              await applyImportResult(editor, currentBoard.elements as ImportResult)
              const snapshot = getSnapshot(editor.store)
              const cleanSnapshot = cleanSnapshotForStorage(snapshot)
              saveActiveBoardElementsRef.current(cleanSnapshot)
            } else {
              const rawSnapshot = JSON.parse(JSON.stringify(currentBoard.elements))
              const normalized = normalizeSnapshot(rawSnapshot)
              const resolved = await resolveSnapshotAssets(normalized, downloadAssetRef.current)
              console.log(`[CanvasPage] loadSnapshot called with store keys=${resolved?.store ? Object.keys(resolved.store).length : 0}`)
              loadSnapshot(editor.store, resolved)
            }
          } catch (e) {
            console.error('Failed to load board:', e)
          }
        } else {
          console.log('[CanvasPage] initBoard skipped - elements empty/null')
        }
      }
      initBoard()
    }

    if (disposeRef.current) {
      disposeRef.current()
    }
    const dispose = editor.store.listen(
      () => {
        const snapshot = getSnapshot(editor.store)
        const clean = cleanSnapshotForStorage(snapshot)
        saveActiveBoardElementsRef.current(clean)
      },
      { scope: 'document' }
    )
    disposeRef.current = dispose
  }, [])

  const handleCreateBoard = async () => {
    const title = `My Whiteboard ${boards.length + 1}`
    const newBoard = await createBoard(title)
    navigate(`/board/${newBoard.id}`)
  }

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

  return (
    <div className="flex-1 relative h-full w-full select-none" key={activeBoard.id}>
      <Tldraw
        onMount={handleMount}
        colorScheme={resolvedTheme}
      />
    </div>
  )
}
export default CanvasPage
