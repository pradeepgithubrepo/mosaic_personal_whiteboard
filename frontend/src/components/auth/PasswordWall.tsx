import React, { useState } from 'react'
import { Lock, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

interface PasswordWallProps {
  onAuthorized: () => void
}

const DEFAULT_HASH = 'c066308c877eb9e6bc3e10d240764e20ec0dacafa658b4a2c8d2abe595bac587' // hash of "charanchainicka"

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const PasswordWall: React.FC<PasswordWallProps> = ({ onAuthorized }) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return

    setIsLoading(true)
    setError('')

    try {
      const hashedInput = await sha256(password)
      
      const targetHash = (import.meta.env.VITE_APP_PASSWORD_HASH || '').trim().toLowerCase()
      const targetPlain = (import.meta.env.VITE_APP_PASSWORD || '').trim()

      const isHashMatch = targetHash ? hashedInput === targetHash : false
      const isPlainMatch = targetPlain ? password === targetPlain : false
      const isDefaultMatch = !targetHash && !targetPlain ? hashedInput === DEFAULT_HASH : false

      if (isHashMatch || isPlainMatch || isDefaultMatch) {
        localStorage.setItem('whiteboard_authorized', 'true')
        onAuthorized()
      } else {
        setError('Incorrect password. Please try again.')
      }
    } catch (err) {
      setError('An error occurred during authentication.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 dark:bg-[#0b0f19] p-4 select-none">
      <div className="w-full max-w-md bg-white dark:bg-[#0f172a] border border-gray-250/60 dark:border-gray-800/80 rounded-3xl p-8 shadow-xl shadow-indigo-650/5 space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-900/20 shadow-sm animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Mosaic Whiteboard
            </h2>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed max-w-[280px]">
              Access to this whiteboard is restricted. Please enter the password to continue.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                disabled={isLoading}
                className="w-full pl-4 pr-11 py-2.5 bg-gray-50 dark:bg-gray-850/50 border border-gray-250 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-250 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start space-x-2 text-xs text-red-650 dark:text-red-400 animate-headShake">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-650/10 hover:shadow-indigo-650/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <span>Unlock Workspace</span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default PasswordWall
