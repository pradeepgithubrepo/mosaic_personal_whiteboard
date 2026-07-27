import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, UploadCloud, FileText, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Layers } from 'lucide-react'
import { useBoard } from '../../hooks/useBoard'
import { ImportManager } from '../../services/import/ImportManager'
import { ImportAnalysis } from '../../services/import/Importer'
import { Board } from '../../types'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
}

type ImportPhase = 'idle' | 'analyzing' | 'preview' | 'importing' | 'success' | 'error'

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate()
  const { repository, downloadAsset, uploadAsset } = useBoard()

  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [importedBoard, setImportedBoard] = useState<Board | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  // Format bytes helper
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processSelectedFile(files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processSelectedFile(files[0])
    }
  }

  const processSelectedFile = async (selectedFile: File) => {
    setFile(selectedFile)
    setPhase('analyzing')
    setProgressMsg('Analyzing file structure...')

    try {
      const result = await ImportManager.analyzeFile(selectedFile)
      setAnalysis(result)
      if (result.isValid) {
        setPhase('preview')
      } else {
        setErrorMsg(result.error || 'Invalid file format.')
        setPhase('error')
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'An error occurred during file analysis.')
      setPhase('error')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setPhase('importing')
    setProgressPercent(5)
    setProgressMsg('Starting migration flow...')

    try {
      // Pass temporary storage interface wrapper utilizing context wrappers
      const storageWrapper = {
        name: 'import-client-wrapper',
        saveBoard: async () => {},
        loadBoard: async () => null,
        deleteBoard: async () => {},
        listBoards: async () => [],
        uploadAsset,
        downloadAsset,
        deleteAsset: async () => {},
        authenticate: async () => {},
        findRootFolder: async () => null,
        createRootFolder: async () => '',
        uploadFile: async () => '',
        downloadFile: async () => '',
        updateFile: async () => {},
        deleteFile: async () => {},
        listFiles: async () => [],
      }

      const board = await ImportManager.importFile(
        file,
        (msg, pct) => {
          setProgressMsg(msg)
          setProgressPercent(pct)
        },
        storageWrapper,
        repository
      )

      setImportedBoard(board)
      setPhase('success')
    } catch (e: any) {
      console.error(e)
      setErrorMsg(e.message || 'Import failed.')
      setPhase('error')
    }
  }

  const handleOpenBoard = () => {
    if (importedBoard) {
      navigate(`/board/${importedBoard.id}`)
      onClose()
    }
  }

  const resetState = () => {
    setPhase('idle')
    setFile(null)
    setAnalysis(null)
    setProgressPercent(0)
    setProgressMsg('')
    setImportedBoard(null)
    setErrorMsg('')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-colors">
      <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-indigo-650 dark:text-indigo-400">
            <Layers className="w-5 h-5" />
            <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
              Whiteboard Migration Engine
            </span>
          </div>
          <button
            onClick={() => {
              resetState()
              onClose()
            }}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col justify-center">
          {/* Phase: Idle (Upload Dropzone) */}
          {phase === 'idle' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px] ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20'
                  : 'border-gray-300 dark:border-gray-750 hover:border-indigo-500 dark:hover:border-indigo-500/80 bg-gray-50/40 dark:bg-gray-900/10'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".png,.jpg,.jpeg,.svg,.pdf,.html,.htm,.zip,.mip.zip"
                className="hidden"
              />
              <UploadCloud className="w-12 h-12 text-indigo-500 animate-pulse mb-3" />
              <h4 className="font-bold text-gray-800 dark:text-gray-250 text-sm">
                Drag and drop your file here
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                Supports <strong>MIP Package (.zip)</strong>, <strong>HTML</strong>, PNG, JPEG, SVG, and PDF.
              </p>
              <button className="mt-4 px-4 py-2 bg-indigo-650 hover:bg-indigo-750 bg-indigo-600 text-white text-xs font-semibold rounded-lg shadow-sm">
                Browse Files
              </button>
            </div>
          )}

          {/* Phase: Analyzing */}
          {phase === 'analyzing' && (
            <div className="text-center py-10 space-y-4">
              <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
              <div>
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">Analyzing File Structure</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{progressMsg}</p>
              </div>
            </div>
          )}

          {/* Phase: Preview Analysis */}
          {phase === 'preview' && analysis && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center space-x-3 bg-gray-50 dark:bg-[#0b0f19] border border-gray-150 dark:border-gray-850 p-3.5 rounded-xl">
                <FileText className="w-9 h-9 text-indigo-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate" title={analysis.fileName}>
                    {analysis.fileName}
                  </h4>
                  <p className="text-gray-450 dark:text-gray-400 mt-0.5">
                    {formatBytes(analysis.fileSize)} • {analysis.mimeType}
                  </p>
                </div>
              </div>

              {/* Analysis Parameters Details */}
              <div className="bg-indigo-50/20 dark:bg-indigo-950/15 border border-indigo-100/40 dark:border-indigo-900/20 p-4 rounded-xl space-y-2">
                <span className="font-bold text-indigo-700 dark:text-indigo-400 block mb-1">Migration Forecast</span>
                <div className="grid grid-cols-2 gap-2 text-gray-650 dark:text-gray-400 font-medium">
                  {analysis.pagesCount !== undefined && (
                    <div>Document Pages: <span className="font-bold text-gray-800 dark:text-gray-200">{analysis.pagesCount} pages</span></div>
                  )}
                  {analysis.estimatedBoardSize && (
                    <div>Est. Board Width: <span className="font-bold text-gray-800 dark:text-gray-200">{analysis.estimatedBoardSize.width}px</span></div>
                  )}
                  {analysis.estimatedBoardSize && (
                    <div>Est. Board Height: <span className="font-bold text-gray-800 dark:text-gray-200">{analysis.estimatedBoardSize.height}px</span></div>
                  )}
                  <div>Est. Upload Size: <span className="font-bold text-gray-800 dark:text-gray-200">{formatBytes(analysis.estimatedUploadSize || analysis.fileSize)}</span></div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  * All vector pages or images will be converted to locked, annotate-ready layers centered in a new whiteboard board.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-2.5 pt-2">
                <button
                  onClick={resetState}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md cursor-pointer flex items-center space-x-1"
                >
                  <span>Begin Import</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Phase: Importing Progress */}
          {phase === 'importing' && (
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-800 dark:text-gray-200">{progressMsg}</span>
                  <span className="font-bold text-indigo-500">{progressPercent}%</span>
                </div>
                {/* Progress bar wrapper */}
                <div className="w-full bg-gray-150 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
              <p className="text-center text-[10px] text-gray-400 leading-relaxed">
                Processing asset files, compiling canvas shapes, and exporting JSON payloads. Please keep this window open.
              </p>
            </div>
          )}

          {/* Phase: Success */}
          {phase === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-base">Migration Succeeded!</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Successfully converted "{file?.name}" into a new board inside your storage provider.
                </p>
              </div>
              <div className="flex justify-center space-x-2 pt-2">
                <button
                  onClick={resetState}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-750 dark:text-gray-300 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Import Another
                </button>
                <button
                  onClick={handleOpenBoard}
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-755 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-md cursor-pointer"
                >
                  Open Board
                </button>
              </div>
            </div>
          )}

          {/* Phase: Error */}
          {phase === 'error' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-100 dark:border-red-900/30">
                <AlertCircle className="w-8 h-8 animate-bounce" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-base">Migration Failed</h4>
                <p className="text-xs text-gray-500 dark:text-gray-450 mt-1 max-w-sm mx-auto leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <div className="flex justify-center space-x-2.5 pt-2">
                <button
                  onClick={() => {
                    resetState()
                    onClose()
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={resetState}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default ImportModal
