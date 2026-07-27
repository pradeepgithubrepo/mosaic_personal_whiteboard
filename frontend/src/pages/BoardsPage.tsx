import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Calendar, Clock, Copy, Trash2, Edit3, LayoutGrid } from 'lucide-react'
import { useBoard } from '../hooks/useBoard'

export const BoardsPage: React.FC = () => {
  const { boards, createBoard, deleteBoard, duplicateBoard, renameBoard, selectBoard, providerName } = useBoard()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alpha'>('newest')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleCreateBoard = async () => {
    const title = `New Whiteboard ${boards.length + 1}`
    const newBoard = await createBoard(title)
    navigate(`/board/${newBoard.id}`)
  }

  const handleOpenBoard = async (id: string) => {
    await selectBoard(id)
    navigate(`/board/${id}`)
  }

  const handleRename = async (id: string) => {
    if (renameTitle.trim()) {
      await renameBoard(id, renameTitle.trim())
      setRenamingId(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    const dup = await duplicateBoard(id)
    navigate(`/board/${dup.id}`)
  }

  // Sort and Filter boards
  const sortedAndFilteredBoards = [...boards]
    .filter((b) => b.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return b.updatedAt.localeCompare(a.updatedAt)
      } else if (sortBy === 'oldest') {
        return a.updatedAt.localeCompare(b.updatedAt)
      } else {
        return a.title.localeCompare(b.title)
      }
    })

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0b0f19] p-6 transition-colors duration-250">
      {/* Upper header summary */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Dashboard
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Managing <span className="font-semibold text-indigo-500">{boards.length}</span> whiteboards on <span className="font-semibold text-indigo-500 capitalize">{providerName}</span> storage.
          </p>
        </div>

        <button
          onClick={handleCreateBoard}
          className="py-2.5 px-5 bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-650/10 hover:shadow-indigo-650/20 hover:-translate-y-0.5 transition-all text-sm flex items-center space-x-2 w-full md:w-auto justify-center cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>New Whiteboard</span>
        </button>
      </div>

      {/* Stats bar */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 p-4 rounded-2xl flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{boards.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Boards</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 p-4 rounded-2xl flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {boards.length > 0
                ? new Date(Math.max(...boards.map((b) => new Date(b.updatedAt).getTime()))).toLocaleDateString()
                : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Last Modified</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 p-4 rounded-2xl flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {boards.length > 0
                ? new Date(Math.min(...boards.map((b) => new Date(b.createdAt).getTime()))).toLocaleDateString()
                : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">First Board Created</div>
          </div>
        </div>
      </div>

      {/* Filter and Sorting Header */}
      <div className="max-w-6xl mx-auto mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-450 dark:text-gray-550 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-[#0f172a] border border-gray-250 dark:border-gray-800 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white placeholder-gray-450 dark:placeholder-gray-550"
          />
        </div>

        {/* Sort Controls */}
        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-sm bg-white dark:bg-[#0f172a] border border-gray-250 dark:border-gray-800 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white font-medium"
          >
            <option value="newest">Recently Updated</option>
            <option value="oldest">Least Recently Updated</option>
            <option value="alpha">A-Z Title</option>
          </select>
        </div>
      </div>

      {/* Boards Grid */}
      <div className="max-w-6xl mx-auto">
        {sortedAndFilteredBoards.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#0f172a] border border-dashed border-gray-250 dark:border-gray-800 rounded-3xl p-6">
            <LayoutGrid className="w-12 h-12 text-gray-300 dark:text-gray-650 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No boards found</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
              {search ? 'Try adjusting your filter query.' : 'Create your first whiteboard to start sketching thoughts and designs.'}
            </p>
            {!search && (
              <button
                onClick={handleCreateBoard}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Create Board
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedAndFilteredBoards.map((board) => {
              const isRenaming = renamingId === board.id
              const isConfirmingDelete = confirmDeleteId === board.id

              return (
                <div
                  key={board.id}
                  onClick={() => !isRenaming && !isConfirmingDelete && handleOpenBoard(board.id)}
                  className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 hover:border-indigo-500 dark:hover:border-indigo-500/80 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer"
                >
                  {/* Card Header (Thumbnail preview stub) */}
                  <div className="h-28 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-center p-4 relative select-none">
                    <div className="text-gray-300 dark:text-gray-700 font-extrabold text-2xl tracking-wider select-none">
                      TLDRAW
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex-1">
                    {isRenaming ? (
                      <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameTitle}
                          onChange={(e) => setRenameTitle(e.target.value)}
                          className="w-full text-sm bg-gray-50 dark:bg-gray-850 border border-indigo-500 rounded px-2 py-1 focus:outline-none dark:text-white"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(board.id)}
                        />
                        <button
                          onClick={() => handleRename(board.id)}
                          className="px-2.5 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-750 font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="px-2 py-1 border border-gray-300 dark:border-gray-700 text-gray-500 rounded hover:bg-gray-150 text-xs dark:text-gray-400"
                        >
                          X
                        </button>
                      </div>
                    ) : isConfirmingDelete ? (
                      <div className="text-center p-1" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs text-red-500 font-semibold mb-2">
                          Permanently delete this board?
                        </p>
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              deleteBoard(board.id)
                              setConfirmDeleteId(null)
                            }}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-bold text-gray-900 dark:text-white text-base truncate group-hover:text-indigo-650 dark:group-hover:text-indigo-400">
                          {board.title}
                        </h4>
                        <div className="flex items-center space-x-3 text-xs text-gray-400 dark:text-gray-555 mt-2">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{new Date(board.updatedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{new Date(board.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  {!isRenaming && !isConfirmingDelete && (
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingId(board.id)
                          setRenameTitle(board.title)
                        }}
                        className="p-1.5 text-gray-550 dark:text-gray-450 hover:bg-gray-100 dark:hover:bg-gray-850 hover:text-gray-800 dark:hover:text-white rounded-lg transition-colors"
                        title="Rename"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDuplicate(board.id)
                        }}
                        className="p-1.5 text-gray-550 dark:text-gray-450 hover:bg-gray-100 dark:hover:bg-gray-850 hover:text-gray-800 dark:hover:text-white rounded-lg transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(board.id)
                        }}
                        className="p-1.5 text-gray-550 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
export default BoardsPage
