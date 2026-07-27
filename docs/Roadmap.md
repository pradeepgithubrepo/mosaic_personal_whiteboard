# Roadmap - Infinite Whiteboard

This document lists the phases of development for the Infinite Whiteboard application.

---

## Phase 1: Local Prototype (Active)
- [x] Scaffold React, Vite, TS, and TailwindCSS (v4) frontend.
- [x] Design abstract `StorageProvider` and `BoardRepository` interfaces.
- [x] Implement local browser LocalStorage-based storage.
- [x] Embed tldraw canvas engine with local state updates.
- [x] Build application layout shell with Sidebar, Top Toolbar, Theme Toggle.
- [x] Implement Light/Dark/System theme.
- [x] Add basic pages: Canvas view, Boards manager, Settings, About.

## Phase 2: Google OAuth & Drive Integration
- Configure Google Developer Console credentials.
- Implement frontend OAuth flow using Google Identity Services (GIS).
- Code the `GoogleDriveProvider` to connect with Google Drive API:
  - Create app-data folder/directories in Google Drive.
  - Sync board JSON files directly to Google Drive.
  - Implement asset upload (images, PDFs) to Drive.

## Phase 3: Supabase Sync
- Configure Supabase database schema for board metadata and multi-device coordination.
- Implement real-time board locking or concurrent state synchronizations.

## Phase 4: Import, Export, & Media
- Add SVG, PNG, and PDF exporters.
- Implement Microsoft Whiteboard migration parser to import exported `.whiteboard` files.

## Phase 5: Smart Indexing & Tagging
- Add asset tags and folder groups.
- Perform client-side/edge OCR on uploaded whiteboard images.
- Full-text search over text shapes, sticky notes, and OCR content.

## Phase 6: AI Co-Pilot
- Connect canvas to LLMs via Supabase Edge Functions or Local LLMs.
- Handwriting smart cleanups, shapes correction, semantic indexing, and smart summaries.
