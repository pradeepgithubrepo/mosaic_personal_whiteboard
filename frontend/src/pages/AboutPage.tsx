import React from 'react'
import { Info, HelpCircle, Cpu, ShieldCheck, Milestone } from 'lucide-react'

export const AboutPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0b0f19] p-6 transition-colors duration-250">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Main Banner */}
        <div className="bg-gradient-to-r from-indigo-500 to-violet-650 dark:from-indigo-900/60 dark:to-violet-950/60 bg-indigo-650 text-white rounded-3xl p-6 md:p-8 shadow-lg shadow-indigo-650/10">
          <div className="flex items-center space-x-3 mb-2">
            <Info className="w-6 h-6 text-indigo-200" />
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-200">
              Technical Specification
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Infinite Board
          </h2>
          <p className="text-sm text-indigo-100 mt-2 max-w-xl leading-relaxed">
            A self-hosted, modular whiteboard engine built for developers, knowledge workers, and creators who demand full control over their canvas and assets.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center space-x-2.5 mb-3 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Vendor Independent</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Your boards are stored as standard JSON configurations, containing full shape nodes and asset pointers. You are never locked into proprietary binary systems.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center space-x-2.5 mb-3 text-indigo-600 dark:text-indigo-400">
              <Cpu className="w-5 h-5" />
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">AI Ready Architecture</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Decoupled layout schemas enable parsing boards into markdown transcripts or semantic vector spaces, ready for integration with private LLMs in future phases.
            </p>
          </div>
        </div>

        {/* User Manual Section */}
        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center space-x-2.5 mb-4 text-indigo-600 dark:text-indigo-400">
            <HelpCircle className="w-5 h-5" />
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Quick Start Manual</h3>
          </div>

          <div className="space-y-3.5 text-xs text-gray-650 dark:text-gray-400">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                1
              </div>
              <div>
                <strong className="text-gray-900 dark:text-gray-200">Drawing & Sketching:</strong> Use the Pen or Pencil tool inside the canvas window to write notes. The canvas spans infinitely in all directions.
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                2
              </div>
              <div>
                <strong className="text-gray-900 dark:text-gray-200">Text & Sticky Notes:</strong> Select the Text or sticky note icon, click anywhere, and start typing. Double-click any element to edit it.
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                3
              </div>
              <div>
                <strong className="text-gray-900 dark:text-gray-200">Zoom & Pan:</strong> Pinch-to-zoom on trackpads, or use `Ctrl + Mouse Scroll` to zoom. Hold `Spacebar + Drag` to pan around.
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                4
              </div>
              <div>
                <strong className="text-gray-900 dark:text-gray-200">Auto-Saving:</strong> The canvas automatically triggers a local save approximately 1 second after you stop drawing or editing. Look at the toolbar to see the status.
              </div>
            </div>
          </div>
        </div>

        {/* Future Milestones */}
        <div className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center space-x-2.5 mb-4 text-indigo-600 dark:text-indigo-400">
            <Milestone className="w-5 h-5" />
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Upcoming Releases</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div className="border-l-2 border-indigo-500 pl-4 space-y-1">
              <h4 className="font-bold text-gray-900 dark:text-gray-200">Phase 2: Cloud Sync & OAuth</h4>
              <p className="text-gray-500 dark:text-gray-450">
                Adding safe authentication and syncing assets straight to your Google Drive directory.
              </p>
            </div>

            <div className="border-l-2 border-indigo-200 dark:border-indigo-850 pl-4 space-y-1">
              <h4 className="font-bold text-gray-700 dark:text-gray-400">Phase 3: Supabase Sync</h4>
              <p className="text-gray-400 dark:text-gray-500">
                Multi-device coordination and metadata syncing using Supabase real-time databases.
              </p>
            </div>

            <div className="border-l-2 border-indigo-200 dark:border-indigo-850 pl-4 space-y-1">
              <h4 className="font-bold text-gray-700 dark:text-gray-400">Phase 5-6: AI Assistant & Handwriting OCR</h4>
              <p className="text-gray-400 dark:text-gray-500">
                Auto-organization, relationship mapping, private OCR transcription, and smart canvas summaries.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default AboutPage
