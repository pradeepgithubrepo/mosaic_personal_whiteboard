# Folder Structure - Infinite Whiteboard

This document explains the organization and directory structure of the repository.

---

## Root Directories

- `frontend/`: The client-side React + Vite single-page application.
- `backend/`: Future Supabase / Node backend configuration, database migrations, and edge functions.
- `shared/`: Shared models, TypeScript types, and validation schemas that can be shared between frontend and backend in future phases.
- `docs/`: Design documents, API schemas, architectures, and release notes.

---

## Frontend Directory Details

```
frontend/src/
├── main.tsx             # Application entry point
├── index.css            # Global CSS and Tailwind entry
├── components/          # Reusable React components
│   ├── canvas/          # Whiteboard canvas wrapper and tldraw handlers
│   ├── boards/          # Board lists, cards, and board management controls
│   ├── toolbar/         # Top application bar
│   ├── sidebar/         # Foldable left sidebar
│   └── common/          # Low-level UI components (ThemeToggle, Button, etc.)
├── storage/             # Data access layers
│   ├── StorageProvider.ts # Low-level file-like API interfaces
│   ├── BoardRepository.ts # Domain repository coordinating board metadata/content
│   └── providers/        # Concrete storage implementations
│       ├── LocalProvider.ts # LocalStorage implementation
│       └── GoogleDriveProvider.ts # Stub for Google Drive REST API
├── hooks/               # Custom React hooks (useBoard, useTheme, etc.)
├── pages/               # Top-level page views mapping to router paths
│   ├── CanvasPage.tsx   # Canvas route
│   ├── BoardsPage.tsx   # Board management dashboard route
│   ├── SettingsPage.tsx # Application settings route
│   └── AboutPage.tsx    # Technical overview route
├── types/               # Type definitions and interfaces
│   └── index.ts
└── styles/              # Global variables, themes, and CSS utilities
```
