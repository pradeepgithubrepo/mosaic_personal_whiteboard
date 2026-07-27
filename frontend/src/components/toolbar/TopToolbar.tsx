import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, Settings, Info, LayoutGrid, RefreshCw, CheckCircle, Moon, Sun, Monitor } from 'lucide-react'
import { useBoard } from '../../hooks/useBoard'
import { useTheme, Theme } from '../../hooks/useTheme'

interface TopToolbarProps {
  onToggleSidebar: () => void
  isSidebarOpen: boolean
}

export const TopToolbar: React.FC<TopToolbarProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { activeBoard, renameBoard, saving, providerName } = useBoard()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const location = useLocation()

  const [title, setTitle] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Sync state with active board
  useEffect(() => {
    if (activeBoard) {
      setTitle(activeBoard.title)
    }
  }, [activeBoard])

  const handleRenameSubmit = async () => {
    setIsEditing(false)
    if (activeBoard && title.trim() && title.trim() !== activeBoard.title) {
      await renameBoard(activeBoard.id, title.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      if (activeBoard) {
        setTitle(activeBoard.title)
      }
    }
  }

  // Theme dropdown cycle or toggle
  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  return (
    <header className="h-14 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between z-30 transition-colors duration-200 shadow-sm">
      {/* Left side: Sidebar Toggle & Board Title */}
      <div className="flex items-center space-x-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          title={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
        >
          <Menu className="w-5 h-5" />
        </button>

        {activeBoard && location.pathname.includes('/board/') ? (
          <div className="flex items-center space-x-2 min-w-0">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleKeyDown}
                className="text-sm font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 sm:w-64"
                autoFocus
              />
            ) : (
              <h1
                onClick={() => setIsEditing(true)}
                className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 px-2 py-0.5 rounded transition-colors truncate max-w-[150px] sm:max-w-[300px]"
                title="Click to rename"
              >
                {activeBoard.title}
              </h1>
            )}

            {/* Save indicator */}
            <div className="flex items-center text-xs text-gray-400 dark:text-gray-500 space-x-1 select-none">
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">
                    {providerName === 'local' ? 'Saved local' : 'Synced Drive'}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <span className="text-base font-bold bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent select-none">
            Infinite Board
          </span>
        )}
      </div>

      {/* Right side: Navigation & Theme Toggle */}
      <div className="flex items-center space-x-1 sm:space-x-2">
        <Link
          to="/boards"
          className={`p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center space-x-1 text-sm ${
            location.pathname === '/boards' ? 'bg-indigo-550/10 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : ''
          }`}
          title="All Boards"
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="hidden md:inline font-medium">Boards</span>
        </Link>

        <Link
          to="/settings"
          className={`p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center space-x-1 text-sm ${
            location.pathname === '/settings' ? 'bg-indigo-550/10 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : ''
          }`}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden md:inline font-medium">Settings</span>
        </Link>

        <Link
          to="/about"
          className={`p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center space-x-1 text-sm ${
            location.pathname === '/about' ? 'bg-indigo-550/10 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : ''
          }`}
          title="About"
        >
          <Info className="w-4 h-4" />
          <span className="hidden md:inline font-medium">About</span>
        </Link>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1"></div>

        {/* Theme Toggle Button */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
          title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
        >
          {theme === 'light' && <Sun className="w-4.5 h-4.5 text-amber-500" />}
          {theme === 'dark' && <Moon className="w-4.5 h-4.5 text-indigo-400" />}
          {theme === 'system' && (
            <div className="relative">
              <Monitor className="w-4.5 h-4.5 text-gray-500 dark:text-gray-400" />
              <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white dark:border-slate-900 flex items-center justify-center text-[6px] text-white font-bold">
                {resolvedTheme === 'dark' ? 'D' : 'L'}
              </span>
            </div>
          )}
        </button>
      </div>
    </header>
  )
}
export default TopToolbar
