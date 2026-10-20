# Mosaic Infinite Whiteboard

Mosaic is a personal, self-hosted, infinite whiteboard application featuring tldraw canvas engine integrations, high-fidelity local storage (IndexedDB), cloud synchronization, and conversion utilities.

---

## Codebase Structure

- `/frontend` - The React Vite single-page application (whiteboard viewport, sidebar, settings, storage providers).
- `/migrate.js` - Standalone Node.js script to migrate Microsoft Whiteboard ZIP exports into canonical Mosaic Packages (MIP).
- `/docs` - Markdown files covering the codebase architecture, import pipelines, and storage formats.
- `/backend` - Mock placeholder for future backend services.
- `/shared` - Shared resources directory.

---

## Getting Started

### 1. Run Whiteboard Locally
To start the React frontend application on your local machine:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser to view the whiteboard.

### 2. Build for Production
To build a minified, production-ready bundle inside `frontend/dist`:
```bash
cd frontend
npm run build
```

---

## Standalone Migration Script

We provide a script (`migrate.js`) to convert a Microsoft Whiteboard export ZIP archive into a canonical Mosaic Package (MIP) ready for importing. It automatically handles pre-order DOM parsing, base64 asset decoding, and converts SVG vector drawings to high-quality PNGs.

### Prerequisites
The script automatically checks for and installs its dependencies locally:
- `jszip` (compression)
- `jsdom` (HTML parsing)
- `sharp` (SVG/image processing)

### Usage
Run the following command from the workspace root:
```bash
node migrate.js <input-zip-path> <output-zip-path>
```

**Example:**
```bash
node migrate.js ./scratch/Board.zip ./scratch/Board.mip.zip
```
Once the `.mip.zip` is generated, open the Mosaic Whiteboard in your browser and click **Import Whiteboard** in the sidebar to upload the file.

---

## Password Wall Security

The application is protected by a client-side password wall to secure access without requiring a database.

- **Default Password:** `charanchainicka`
- **Security Design:** The plain-text password is **never** hardcoded or pushed to Git. Only its SHA-256 hash is embedded in the source code as a fallback.
- **Login Session Persistence:** Entering the correct password saves an authorization token in the browser's `localStorage` so you do not need to re-login on subsequent visits.

### How to Change the Password
To customize the password (safe for GitHub/public repositories), compute the SHA-256 hash of your desired password and set it as an environment variable in your deployment platform (e.g., Netlify) or in a local `.env` file inside `frontend/`:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example frontend/.env
   ```
2. Compute the SHA-256 hash of your new password (using Node.js):
   ```bash
   node -e "console.log(require('crypto').createHash('sha256').update('your-new-password').digest('hex'))"
   ```
3. Update `VITE_APP_PASSWORD_HASH` inside `frontend/.env` with your new hash:
   ```env
   VITE_APP_PASSWORD_HASH=your_calculated_sha256_hash
   ```

---

## GitHub Board Sync

The **GitHub Repository** storage provider stages canvas updates in the browser. Selecting
**Save to GitHub** on the canvas writes the current board to:

```text
.mosaic/boards/<board-id>.json
.mosaic/assets/<board-id>/<asset-id>.base64
```

The deployed Netlify site needs a server-side environment variable named `git_fine_pat`.
Use a fine-grained GitHub token restricted to `pradeepgithubrepo/mosaic_personal_whiteboard`
with **Contents: Read and write** permission. Do not add this token to a `VITE_` variable
or any committed `.env` file. Image data is stored as separate Git blobs, keeping the board
JSON within GitHub API limits.
