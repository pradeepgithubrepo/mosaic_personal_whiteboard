import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BoardProvider } from './storage/BoardContext'
import TopToolbar from './components/toolbar/TopToolbar'
import Sidebar from './components/sidebar/Sidebar'
import CanvasPage from './pages/CanvasPage'
import BoardsPage from './pages/BoardsPage'
import SettingsPage from './pages/SettingsPage'
import AboutPage from './pages/AboutPage'
import AuthCallback from './pages/AuthCallback'

const AppContent: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#0b0f19] transition-colors duration-200">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {/* Top Header Bar */}
        <TopToolbar onToggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />

        {/* Page Render View */}
        <main className="flex-1 min-h-0 w-full relative flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<CanvasPage />} />
            <Route path="/board/:id" element={<CanvasPage />} />
            <Route path="/boards" element={<BoardsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <BoardProvider>
        <AppContent />
      </BoardProvider>
    </BrowserRouter>
  )
}

export default App
