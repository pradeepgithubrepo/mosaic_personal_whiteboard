import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Search, Trash2, Copy, Edit3, X, HardDrive, Layout, ChevronLeft, Check, AlertCircle, Upload } from 'lucide-react'
import { useBoard } from '../../hooks/useBoard'
import { BoardHeader } from '../../types'
import ImportModal from '../import/ImportModal'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const {
    boards,
    activeBoard,
    createBoard,
    deleteBoard,
    duplicateBoard,
    renameBoard,
    selectBoard,
    providerName,
  } = useBoard()

  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  
  // Board Rename Mode
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')

  // Board Delete Confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtered boards list
  const filteredBoards = boards.filter((board) =>
    board.title.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreateBoard = async () => {
    const title = `Untitled Board ${boards.length + 1}`
    const newBoard = await createBoard(title)
    navigate(`/board/${newBoard.id}`)
    if (window.innerWidth < 768) {
      onClose() // Auto-close sidebar on mobile
    }
  }

  const handleSelectBoard = async (id: string) => {
    await selectBoard(id)
    navigate(`/board/${id}`)
    if (window.innerWidth < 768) {
      onClose()
    }
  }

  const startRename = (board: BoardHeader, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(board.id)
    setRenameTitle(board.title)
  }

  const submitRename = async (id: string, e: React.FormEvent) => {
    e.preventDefault()
    if (renameTitle.trim()) {
      await renameBoard(id, renameTitle.trim())
    }
    setRenamingId(null)
  }

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const dup = await duplicateBoard(id)
    navigate(`/board/${dup.id}`)
  }

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(id)
  }

  const executeDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteBoard(id)
    setDeletingId(null)
    // If deleted the active board, redirect to dashboard
    if (activeBoard?.id === id) {
      navigate('/boards')
    }
  }

  return (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-gray-50 dark:bg-[#0f172a] border-r border-gray-200 dark:border-gray-800 flex flex-col transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
      }`}
    >
      {/* Sidebar Header */}
      <div className="h-14 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layout className="w-5 h-5 text-indigo-500" />
          <span className="font-bold text-gray-800 dark:text-gray-200 text-sm tracking-wide uppercase">
            My Whiteboards
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 md:hidden"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Action: Create & Import Board */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-2">
        <button
          onClick={handleCreateBoard}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-md shadow-indigo-650/10 hover:shadow-indigo-650/20 transition-all flex items-center justify-center space-x-2 text-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Whiteboard</span>
        </button>
        <button
          onClick={() => setIsImportModalOpen(true)}
          className="w-full py-2 px-4 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-all flex items-center justify-center space-x-2 text-xs cursor-pointer"
        >
          <Upload className="w-4 h-4 text-indigo-500" />
          <span>Import Whiteboard</span>
        </button>
      </div>

      {/* Filter / Search */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-450 dark:text-gray-550 text-gray-400" />
          <input
            type="text"
            placeholder="Search boards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-gray-800 border border-gray-250 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Board List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredBoards.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
            {search ? 'No matches found' : 'No boards created yet'}
          </div>
        ) : (
          filteredBoards.map((board) => {
            const isActive = activeBoard?.id === board.id && location.pathname.includes('/board/')
            const isDeleting = deletingId === board.id
            const isRenaming = renamingId === board.id

            if (isDeleting) {
              return (
                <div
                  key={board.id}
                  className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl flex flex-col space-y-2 text-xs"
                >
                  <div className="flex items-center space-x-1.5 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold truncate">Delete "{board.title}"?</span>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingId(null)
                      }}
                      className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={(e) => executeDelete(board.id, e)}
                      className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={board.id}
                onClick={() => handleSelectBoard(board.id)}
                className={`group w-full p-2.5 rounded-xl text-left transition-all duration-200 flex items-center justify-between cursor-pointer border ${
                  isActive
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/40 dark:text-indigo-400'
                    : 'bg-transparent border-transparent text-gray-700 hover:bg-gray-100 hover:border-gray-200 dark:text-gray-300 dark:hover:bg-gray-850 dark:hover:bg-gray-900/40 dark:hover:border-gray-800'
                }`}
              >
                {isRenaming ? (
                  <form
                    onSubmit={(e) => submitRename(board.id, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center space-x-1 flex-1 min-w-0"
                  >
                    <input
                      type="text"
                      value={renameTitle}
                      onChange={(e) => setRenameTitle(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-gray-850 border border-indigo-500 rounded px-1.5 py-0.5 focus:outline-none dark:text-white"
                      autoFocus
                      onBlur={() => setRenamingId(null)}
                    />
                    <button type="submit" className="p-1 text-emerald-600 hover:text-emerald-500">
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="p-1 text-red-500 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-sm font-semibold truncate group-hover:text-indigo-650 dark:group-hover:text-indigo-400">
                      {board.title}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      Updated {new Date(board.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}

                {/* Operations overlay */}
                {!isRenaming && (
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRename(board, e)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded"
                      title="Rename"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(board.id, e)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => confirmDelete(board.id, e)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900/60 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-1.5">
          <HardDrive className="w-4 h-4 text-indigo-500" />
          <span className="capitalize font-medium">{providerName} Provider</span>
        </div>
        <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 px-2 py-0.5 rounded font-medium border border-indigo-100 dark:border-indigo-900/20">
          v1.0.0
        </span>
      </div>

      {/* Import Modal Overlay */}
      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
    </aside>
  )
}
export default Sidebar
