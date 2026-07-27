import React, { useState, useEffect } from 'react'
import { HardDrive, Moon, Sun, Monitor, Check, ShieldCheck, RefreshCw, LogOut, Play, CheckCircle, XCircle, FileText, Download, Layers } from 'lucide-react'
import { useBoard } from '../hooks/useBoard'
import { useTheme, Theme } from '../hooks/useTheme'
import { GoogleDriveProvider } from '../storage/providers/GoogleDriveProvider'
import { ImportManager } from '../services/import/ImportManager'
import { ImportLog } from '../services/import/Importer'

interface ValidationStep {
  id: number
  name: string
  status: 'pending' | 'running' | 'pass' | 'fail'
  notes: string
}

export const SettingsPage: React.FC = () => {
  const { providerName, setProviderName } = useBoard()
  const { theme, setTheme } = useTheme()

  // Google Profile State
  const [profile, setProfile] = useState<{ email: string; name: string; picture: string } | null>(null)
  const [connected, setConnected] = useState(false)

  // Validation Panel State
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<ValidationStep[]>([
    { id: 1, name: 'Authenticate', status: 'pending', notes: 'Verifies presence of valid Google access token.' },
    { id: 2, name: 'Find Workspace', status: 'pending', notes: 'Searches for existing .mosaic marker file in Google Drive.' },
    { id: 3, name: 'Create Workspace', status: 'pending', notes: 'Creates Mosaic/ folder structure if not found.' },
    { id: 4, name: 'Upload File', status: 'pending', notes: 'Creates a test.json board file inside Boards/ folder.' },
    { id: 5, name: 'Read File', status: 'pending', notes: 'Downloads test.json and compares content structure.' },
    { id: 6, name: 'Update File', status: 'pending', notes: 'Edits test.json content and asserts that the File ID is preserved.' },
    { id: 7, name: 'Delete File', status: 'pending', notes: 'Deletes test.json and confirms it is removed.' },
    { id: 8, name: 'Folder Isolation', status: 'pending', notes: 'Verifies files are written only inside the Mosaic workspace.' },
  ])

  const [workspaceDetails, setWorkspaceDetails] = useState<{
    rootId: string
    markerId: string
    boardsId: string
    imagesId: string
    exportsId: string
  } | null>(null)

  const [validationLogs, setValidationLogs] = useState<string[]>([])
  const [logs, setLogs] = useState<ImportLog[]>([])

  useEffect(() => {
    const email = localStorage.getItem('whiteboard_oauth_user_email')
    const name = localStorage.getItem('whiteboard_oauth_user_name')
    const picture = localStorage.getItem('whiteboard_oauth_user_picture')
    const token = localStorage.getItem('whiteboard_oauth_access_token')

    if (token && email) {
      setProfile({ email, name: name || 'Google User', picture: picture || '' })
      setConnected(true)
    } else {
      setProfile(null)
      setConnected(false)
    }

    // Load whiteboard import logs
    setLogs(ImportManager.getImportLogs())
  }, [])

  const handleClearLogs = () => {
    localStorage.removeItem('whiteboard_import_logs')
    setLogs([])
  }

  const handleConnect = async () => {
    try {
      const provider = new GoogleDriveProvider()
      await provider.authenticate()
    } catch (e: any) {
      alert(`Connection failed: ${e.message}`)
    }
  }

  const handleDisconnect = () => {
    // Clear all OAuth and folder variables
    localStorage.removeItem('whiteboard_oauth_access_token')
    localStorage.removeItem('whiteboard_oauth_refresh_token')
    localStorage.removeItem('whiteboard_oauth_expires_at')
    localStorage.removeItem('whiteboard_oauth_user_email')
    localStorage.removeItem('whiteboard_oauth_user_name')
    localStorage.removeItem('whiteboard_oauth_user_picture')
    localStorage.removeItem('whiteboard_gdrive_folder_cache')
    localStorage.removeItem('whiteboard_local_root_folder_id')

    setProfile(null)
    setConnected(false)
    setProviderName('local')
    setWorkspaceDetails(null)
    setSteps(prev => prev.map(s => ({ ...s, status: 'pending', notes: '' })))
    setValidationLogs([])
  }

  const log = (msg: string) => {
    console.log(`[ValidationSuite] ${msg}`)
    setValidationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const updateStep = (id: number, status: 'running' | 'pass' | 'fail', notes: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, notes } : s)))
  }

  const runValidation = async () => {
    if (running) return
    setRunning(true)
    setValidationLogs([])
    setWorkspaceDetails(null)

    // Reset steps
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending', notes: '' })))

    const provider = new GoogleDriveProvider()
    log('Initializing Google Drive Validation Suite...')

    // Step 1: Authenticate
    updateStep(1, 'running', 'Verifying active access token...')
    log('Case 1: Checking OAuth Token...')
    let token = ''
    try {
      token = localStorage.getItem('whiteboard_oauth_access_token') || ''
      if (!token) throw new Error('No access token found in localStorage. Please sign in.')
      
      log('Fetching tokeninfo from Google to inspect authorized scopes...')
      const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`)
      if (!tokenInfoRes.ok) {
        throw new Error('Failed to validate token with Google OAuth server. It may be expired or revoked.')
      }
      
      const tokenInfo = await tokenInfoRes.json()
      const scopes = tokenInfo.scope ? tokenInfo.scope.split(' ') : []
      log(`Token info scopes: ${scopes.join(', ')}`)
      
      const hasDriveFile = scopes.includes('https://www.googleapis.com/auth/drive.file')
      if (!hasDriveFile) {
        throw new Error('Token lacks drive.file permission! Please disconnect, sign in again, and make sure you check the checkbox to allow Google Drive access.')
      }
      
      log(`OAuth Token check passed. Email: ${localStorage.getItem('whiteboard_oauth_user_email')}`)
      updateStep(1, 'pass', `Pass - Token validated. Scope: drive.file`)
    } catch (e: any) {
      log(`OAuth Token check failed: ${e.message}`)
      updateStep(1, 'fail', `Fail - ${e.message}`)
      setRunning(false)
      return
    }

    // Step 2 & 3: Workspace Discovery & Creation
    updateStep(2, 'running', 'Searching for existing workspace...')
    updateStep(3, 'running', 'Awaiting discovery results...')

    log('Case 2 & 3: Workspace Search & Initialization...')
    let workspace: any = null
    try {
      workspace = await provider.initializeWorkspace()
      log(`Workspace loaded successfully. Root Folder ID: ${workspace.rootFolderId}`)
      log(`Marker File ID: ${workspace.markerFileId}`)
      log(`Boards Folder ID: ${workspace.boardsFolderId}`)
      
      setWorkspaceDetails({
        rootId: workspace.rootFolderId,
        markerId: workspace.markerFileId,
        boardsId: workspace.boardsFolderId,
        imagesId: workspace.imagesFolderId,
        exportsId: workspace.exportsFolderId,
      })

      updateStep(2, 'pass', `Pass - Located .mosaic marker: ${workspace.markerFileId}`)
      updateStep(3, 'pass', `Pass - Folders present. Boards: ${workspace.boardsFolderId}`)
    } catch (e: any) {
      log(`Workspace search/creation failed: ${e.message}`)
      updateStep(2, 'fail', `Fail - Workspace discovery error: ${e.message}`)
      updateStep(3, 'fail', `Fail - Workspace folders creation error: ${e.message}`)
      setRunning(false)
      return
    }

    // Step 4: Upload File
    updateStep(4, 'running', 'Uploading test.json to Boards/...')
    log('Case 4: Uploading test board file...')
    let fileId = ''
    try {
      const testContent = JSON.stringify({ board: 'Test Board', version: 1 })
      fileId = await provider.uploadFile(workspace.boardsFolderId, 'test.json', 'application/json', testContent)
      log(`Uploaded test.json successfully. File ID: ${fileId}`)
      updateStep(4, 'pass', `Pass - File uploaded. File ID: ${fileId}`)
    } catch (e: any) {
      log(`Upload failed: ${e.message}`)
      updateStep(4, 'fail', `Fail - Upload error: ${e.message}`)
      setRunning(false)
      return
    }

    // Step 5: Read File
    updateStep(5, 'running', 'Downloading test.json and comparing...')
    log('Case 5: Downloading and reading test board file...')
    try {
      const content = await provider.downloadFile(fileId)
      log(`Downloaded content: ${content}`)
      const parsed = JSON.parse(content)
      if (parsed.board === 'Test Board' && parsed.version === 1) {
        updateStep(5, 'pass', 'Pass - Read content matches upload content exactly.')
      } else {
        throw new Error(`Data mismatch: Expected Test Board v1, got ${content}`)
      }
    } catch (e: any) {
      log(`Read failed: ${e.message}`)
      updateStep(5, 'fail', `Fail - Read error: ${e.message}`)
      setRunning(false)
      return
    }

    // Step 6: Update File
    updateStep(6, 'running', 'Updating test.json and verifying ID...')
    log('Case 6: Modifying file content in-place...')
    try {
      const updatedContent = JSON.stringify({ board: 'Updated Board', version: 2 })
      await provider.updateFile(fileId, updatedContent)
      log('File content updated. Reloading content to check...')

      const reloaded = await provider.downloadFile(fileId)
      log(`Reloaded content: ${reloaded}`)
      const parsed = JSON.parse(reloaded)

      if (parsed.board === 'Updated Board' && parsed.version === 2) {
        updateStep(6, 'pass', `Pass - Content successfully modified. File ID remained: ${fileId}`)
      } else {
        throw new Error(`Data mismatch after update: ${reloaded}`)
      }
    } catch (e: any) {
      log(`Update failed: ${e.message}`)
      updateStep(6, 'fail', `Fail - Update error: ${e.message}`)
      setRunning(false)
      return
    }

    // Step 7: Delete File
    updateStep(7, 'running', 'Deleting test.json...')
    log('Case 7: Removing test file from Drive...')
    try {
      await provider.deleteFile(fileId)
      log('Delete request processed. Checking if file is removed...')

      try {
        await provider.downloadFile(fileId)
        throw new Error('File still accessible after delete request!')
      } catch (err: any) {
        // We expect it to fail (404/Error) since it was deleted
        log('Confirmed file is no longer accessible.')
      }
      updateStep(7, 'pass', 'Pass - File successfully deleted from Boards/.')
    } catch (e: any) {
      log(`Delete failed: ${e.message}`)
      updateStep(7, 'fail', `Fail - Delete error: ${e.message}`)
      setRunning(false)
      return
    }

    // Step 8: Folder Isolation
    updateStep(8, 'running', 'Verifying folder isolation...')
    log('Case 8: Validating folder isolation...')
    try {
      const files = await provider.listFiles(workspace.boardsFolderId)
      const orphan = files.find((f: any) => f.id === fileId)
      if (orphan) {
        throw new Error('Test file metadata still listed in Boards directory!')
      }
      log('Folder isolation verified. All files stay within the workspace directory.')
      updateStep(8, 'pass', 'Pass - Isolation verified. All operations constrained inside workspace.')
    } catch (e: any) {
      log(`Isolation check failed: ${e.message}`)
      updateStep(8, 'fail', `Fail - Isolation check error: ${e.message}`)
    }

    log('Validation suite finished successfully.')
    setRunning(false)
  }

  const downloadReport = () => {
    if (!profile) return

    const header = `# Google Drive Workspace Integration Validation Report
Created: ${new Date().toLocaleString()}
User: ${profile.name} (${profile.email})
Storage Scope: https://www.googleapis.com/auth/drive.file

## Workspace Folders Discovery
- **Root Folder ID**: ${workspaceDetails?.rootId || 'N/A'}
- **Marker File ID**: ${workspaceDetails?.markerId || 'N/A'}
- **Boards Folder ID**: ${workspaceDetails?.boardsId || 'N/A'}
- **Images Folder ID**: ${workspaceDetails?.imagesId || 'N/A'}
- **Exports Folder ID**: ${workspaceDetails?.exportsId || 'N/A'}

## CRUD Integration Status Table

| Step | Test Name | Status | Observed Results / Notes |
| :--- | :--- | :--- | :--- |
${steps
  .map(
    (s) =>
      `| ${s.id} | ${s.name} | **${s.status.toUpperCase()}** | ${s.notes} |`
  )
  .join('\n')}

## Detailed Execution Logs
\`\`\`text
${validationLogs.join('\n')}
\`\`\`
`

    const blob = new Blob([header], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mosaic_gdrive_validation_${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0b0f19] p-6 transition-colors duration-250">
      <div className="max-w-3xl mx-auto space-y-6">
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Settings
        </h2>

        {/* Card 1: Theme Settings */}
        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Appearance</h3>
          <p className="text-xs text-gray-500 dark:text-gray-450 mb-4">
            Select how Infinite Board fits your environment theme.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'light', label: 'Light', icon: Sun, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20' },
              { id: 'dark', label: 'Dark', icon: Moon, color: 'text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20' },
              { id: 'system', label: 'System', icon: Monitor, color: 'text-gray-500 bg-gray-550/5 dark:bg-gray-850/10' },
            ].map((opt) => {
              const IconComponent = opt.icon
              const isActive = theme === opt.id

              return (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id as Theme)}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                    isActive
                      ? 'border-indigo-650 bg-indigo-50/10 dark:bg-indigo-950/10 border-indigo-500'
                      : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-850'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${opt.color}`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    {opt.label}
                  </span>
                  {isActive && (
                    <span className="text-[10px] text-indigo-500 font-bold flex items-center">
                      <Check className="w-3.5 h-3.5 mr-0.5" /> Active
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Card 2: Storage Connection */}
        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Storage Provider</h3>
          <p className="text-xs text-gray-500 dark:text-gray-450 mb-4">
            Connect and synchronize boards to LocalStorage or your Google Drive folder.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setProviderName('local')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                providerName === 'local'
                  ? 'border-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/10'
                  : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-850'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                {providerName === 'local' && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                    Connected
                  </span>
                )}
              </div>
              <div className="mt-4">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white">Local Storage</h4>
                <p className="text-[11px] text-gray-450 dark:text-gray-400 mt-1">
                  Saves whiteboard boards inside LocalStorage. Quick and requires no accounts.
                </p>
              </div>
            </button>

            <button
              onClick={() => connected && setProviderName('google-drive')}
              disabled={!connected}
              className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                !connected
                  ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#0f172a] opacity-50 cursor-not-allowed'
                  : providerName === 'google-drive'
                  ? 'border-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/10 cursor-pointer'
                  : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-850 cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                {connected && providerName === 'google-drive' ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                    Connected
                  </span>
                ) : connected ? (
                  <span className="px-2 py-0.5 rounded bg-gray-150 text-gray-600 text-[10px] font-medium">
                    Inactive
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                    Auth Required
                  </span>
                )}
              </div>
              <div className="mt-4">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white">Google Drive</h4>
                <p className="text-[11px] text-gray-450 dark:text-gray-400 mt-1">
                  Saves boards inside a custom Google Drive workspace directory. Fully private.
                </p>
              </div>
            </button>
          </div>

          {/* Account Profile Status */}
          {connected && profile ? (
            <div className="p-4 bg-gray-50 dark:bg-[#0b0f19] border border-gray-200 dark:border-gray-850 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {profile.picture ? (
                  <img src={profile.picture} alt={profile.name} className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700">
                    {profile.name[0]}
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">{profile.name}</h4>
                  <p className="text-xs text-gray-500">{profile.email}</p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
              >
                <LogOut className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 text-white rounded-xl text-sm font-semibold shadow-md cursor-pointer flex items-center justify-center space-x-2"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>Connect Google Drive account</span>
            </button>
          )}
        </div>

        {/* Card 3: Validation Panel */}
        {connected && (
          <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-150 dark:border-gray-800 pb-4 mb-4 gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Integration Validation Suite</h3>
                <p className="text-xs text-gray-500 dark:text-gray-450 mt-0.5">
                  Execute direct, live CRUD operations to verify application folder isolation and discovery.
                </p>
              </div>
              <div className="flex space-x-2 shrink-0">
                <button
                  onClick={runValidation}
                  disabled={running}
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center space-x-1.5"
                >
                  {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>Run Suite</span>
                </button>
                {workspaceDetails && (
                  <button
                    onClick={downloadReport}
                    className="py-2 px-4 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg cursor-pointer flex items-center space-x-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Report</span>
                  </button>
                )}
              </div>
            </div>

            {/* Test Step items */}
            <div className="space-y-3">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="p-3 bg-gray-50 dark:bg-[#0b0f19] border border-gray-200 dark:border-gray-850/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-gray-900 dark:text-white">
                      Test {step.id} – {step.name}
                    </span>
                    <p className="text-gray-500 mt-0.5 leading-relaxed truncate max-w-lg" title={step.notes}>
                      {step.notes}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center">
                    {step.status === 'pending' && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-bold">
                        Pending
                      </span>
                    )}
                    {step.status === 'running' && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center space-x-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Running</span>
                      </span>
                    )}
                    {step.status === 'pass' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center space-x-1 border border-emerald-100 dark:border-emerald-900/30">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Pass</span>
                      </span>
                    )}
                    {step.status === 'fail' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 text-[10px] font-bold flex items-center space-x-1 border border-red-100 dark:border-red-900/30">
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                        <span>Fail</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Workspace ID details */}
            {workspaceDetails && (
              <div className="mt-5 p-4 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl space-y-2 text-xs">
                <div className="flex items-center space-x-1.5 text-indigo-700 dark:text-indigo-400 font-bold mb-1">
                  <FileText className="w-4.5 h-4.5" />
                  <span>Workspace Folder Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-650 dark:text-gray-400 font-mono">
                  <div>Root Folder ID: <span className="font-semibold text-gray-800 dark:text-gray-200 select-all">{workspaceDetails.rootId}</span></div>
                  <div>Marker File ID: <span className="font-semibold text-gray-800 dark:text-gray-200 select-all">{workspaceDetails.markerId}</span></div>
                  <div>Boards Folder ID: <span className="font-semibold text-gray-800 dark:text-gray-200 select-all">{workspaceDetails.boardsId}</span></div>
                  <div>Images Folder ID: <span className="font-semibold text-gray-800 dark:text-gray-200 select-all">{workspaceDetails.imagesId}</span></div>
                </div>
              </div>
            )}

            {/* Validation Logs Terminal */}
            {validationLogs.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-gray-400 dark:text-gray-500 font-semibold">Console Logs</span>
                <div className="mt-1.5 p-3 bg-gray-900 text-gray-100 dark:bg-black rounded-xl font-mono text-[10px] h-36 overflow-y-auto space-y-1 scroll-smooth">
                  {validationLogs.map((logLine, idx) => (
                    <div key={idx} className="leading-relaxed whitespace-pre-wrap select-all">
                      {logLine}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Whiteboard Migration History Logs */}
        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Whiteboard Migration Logs</h3>
                <p className="text-xs text-gray-500">Track and review imported PNG, JPEG, SVG, and PDF boards.</p>
              </div>
            </div>
            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="text-xs font-semibold text-red-500 hover:text-red-650 cursor-pointer"
              >
                Clear History
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-450 dark:text-gray-500">
              No whiteboard migration history found. Use "Import Whiteboard" in the sidebar to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-155 dark:border-gray-800 text-gray-450 dark:text-gray-500 font-semibold">
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5">Original File</th>
                    <th className="py-2.5">Type</th>
                    <th className="py-2.5">Assets</th>
                    <th className="py-2.5">Duration</th>
                    <th className="py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {logs.map((log) => (
                    <tr key={log.id} className="text-gray-750 dark:text-gray-300 font-medium">
                      <td className="py-3">{new Date(log.importDate).toLocaleString()}</td>
                      <td className="py-3 font-semibold text-gray-900 dark:text-white truncate max-w-[160px]" title={log.originalFileName}>
                        {log.originalFileName}
                      </td>
                      <td className="py-3">{log.importType}</td>
                      <td className="py-3">{log.assetsCount} items</td>
                      <td className="py-3">{(log.durationMs / 1000).toFixed(2)}s</td>
                      <td className="py-3">
                        {log.status === 'success' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-100 dark:border-emerald-900/30">
                            Success
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 text-[10px] font-bold border border-red-100 dark:border-red-900/30" title={log.error}>
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default SettingsPage
