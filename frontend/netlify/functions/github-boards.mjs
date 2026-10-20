const DEFAULT_REPOSITORY = 'pradeepgithubrepo/mosaic_personal_whiteboard'
const DEFAULT_BRANCH = 'master'
const BOARDS_DIRECTORY = '.mosaic/boards'
const ASSETS_DIRECTORY = '.mosaic/assets'
const MAX_BOARD_BYTES = 900_000
const MAX_ASSET_BYTES = 3_500_000
const MAX_RAW_BOARD_BYTES = 5_000_000

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

const githubPath = (path) => path.split('/').map(encodeURIComponent).join('/')

const toBase64 = (value) => Buffer.from(value, 'utf8').toString('base64')

const fromBase64 = (value) => Buffer.from(value.replace(/\n/g, ''), 'base64').toString('utf8')

const badRequest = (message) => {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

const getConfig = () => {
  const token = process.env.git_fine_pat || process.env.GIT_FINE_PAT
  if (!token) {
    throw new Error('GitHub sync is not configured. Set the git_fine_pat Netlify environment variable.')
  }

  return {
    token,
    repository: process.env.MOSAIC_GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    branch: process.env.MOSAIC_GITHUB_BRANCH || DEFAULT_BRANCH,
  }
}

const githubRequest = async (config, path, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${config.repository}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })

  if (response.status === 204) return null

  const body = await response.json().catch(() => ({ message: response.statusText }))
  if (!response.ok) {
    const error = new Error(body.message || `GitHub request failed (${response.status}).`)
    error.statusCode = response.status
    error.details = body
    throw error
  }

  return body
}

const validateBoard = (board) => {
  if (!board || typeof board !== 'object' || typeof board.id !== 'string' || !/^[\w-]+$/.test(board.id)) {
    throw badRequest('Invalid board payload.')
  }
  if (typeof board.title !== 'string' || !board.title.trim()) {
    throw badRequest('A board title is required.')
  }
  if (Buffer.byteLength(JSON.stringify(board), 'utf8') > MAX_RAW_BOARD_BYTES) {
    throw badRequest('This board exceeds the 5 MB GitHub sync request limit.')
  }

  return board
}

const boardPath = (id) => `${BOARDS_DIRECTORY}/${id}.json`
const assetPath = (boardId, fileId) =>
  `${ASSETS_DIRECTORY}/${boardId}/${fileId.replace(/[^\w-]/g, '_')}.base64`

const splitDataUrl = (dataUrl) => {
  const match = /^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/s.exec(dataUrl)
  if (!match) throw badRequest('An embedded board asset is not a base64 data URL.')
  return { mimeType: match[1], content: match[2].replace(/\s/g, '') }
}

const prepareBoardForCommit = (board) => {
  const compactBoard = JSON.parse(JSON.stringify(board))
  const assets = []

  for (const [fileId, file] of Object.entries(compactBoard.elements?.files || {})) {
    if (!file?.dataURL) continue

    const { content } = splitDataUrl(file.dataURL)
    if (Buffer.byteLength(content, 'base64') > MAX_ASSET_BYTES) {
      throw badRequest(`Embedded asset ${fileId} exceeds the 3.5 MB GitHub sync limit.`)
    }

    const path = assetPath(compactBoard.id, fileId)
    assets.push({ path, content })
    delete file.dataURL
    file.mosaicAssetPath = path
  }

  const serializedBoard = JSON.stringify(compactBoard)
  if (Buffer.byteLength(serializedBoard, 'utf8') > MAX_BOARD_BYTES) {
    throw badRequest('The board metadata is too large to commit through GitHub sync.')
  }

  return { serializedBoard, assets }
}

const readBoard = async (config, id) => {
  const file = await githubRequest(
    config,
    `/contents/${githubPath(boardPath(id))}?ref=${encodeURIComponent(config.branch)}`
  )
  return { board: JSON.parse(fromBase64(file.content)), sha: file.sha }
}

const getBranchHead = async (config) => {
  const ref = await githubRequest(config, `/git/ref/heads/${encodeURIComponent(config.branch)}`)
  const commit = await githubRequest(config, `/git/commits/${ref.object.sha}`)
  return { commitSha: ref.object.sha, treeSha: commit.tree.sha }
}

const createBlob = async (config, content) => {
  const blob = await githubRequest(config, '/git/blobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding: 'base64' }),
  })
  return blob.sha
}

const commitTree = async (config, message, entries) => {
  const head = await getBranchHead(config)
  const tree = await githubRequest(config, '/git/trees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: head.treeSha, tree: entries }),
  })
  const commit = await githubRequest(config, '/git/commits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: tree.sha, parents: [head.commitSha] }),
  })
  try {
    await githubRequest(config, `/git/refs/heads/${encodeURIComponent(config.branch)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    })
  } catch (error) {
    if (error.statusCode === 422) {
      error.statusCode = 409
      error.message = 'The GitHub branch changed while this board was being saved.'
    }
    throw error
  }
  return commit.sha
}

const readAsset = async (config, path) => {
  if (!new RegExp(`^${ASSETS_DIRECTORY.replace('.', '\\.')}\\/[\\w-]+\\/[\\w-]+\\.base64$`).test(path)) {
    throw badRequest('Invalid board asset path.')
  }
  const file = await githubRequest(
    config,
    `/contents/${githubPath(path)}?ref=${encodeURIComponent(config.branch)}`
  )
  const blob = await githubRequest(config, `/git/blobs/${file.sha}`)
  return blob.content.replace(/\n/g, '')
}

const listBoards = async (config) => {
  const tree = await githubRequest(
    config,
    `/git/trees/${encodeURIComponent(config.branch)}?recursive=1`
  )
  const boardFiles = (tree.tree || []).filter(
    (entry) => entry.type === 'blob' && entry.path.startsWith(`${BOARDS_DIRECTORY}/`) && entry.path.endsWith('.json')
  )

  const boards = await Promise.all(
    boardFiles.map(async (entry) => {
      try {
        const file = await githubRequest(
          config,
          `/contents/${githubPath(entry.path)}?ref=${encodeURIComponent(config.branch)}`
        )
        const board = JSON.parse(fromBase64(file.content))
        return {
          id: board.id,
          title: board.title,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          thumbnail: board.thumbnail,
        }
      } catch {
        return null
      }
    })
  )

  return boards
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' })
  }

  try {
    const config = getConfig()
    const request = JSON.parse(event.body || '{}')

    if (request.action === 'list') {
      return json(200, { boards: await listBoards(config) })
    }

    if (request.action === 'load') {
      const { board } = await readBoard(config, request.id)
      return json(200, { board })
    }

    if (request.action === 'loadAsset') {
      return json(200, { content: await readAsset(config, request.path) })
    }

    if (request.action === 'commit') {
      const board = validateBoard(request.board)
      const { serializedBoard, assets } = prepareBoardForCommit(board)
      const assetEntries = await Promise.all(
        assets.map(async (asset) => ({
          path: asset.path,
          mode: '100644',
          type: 'blob',
          sha: await createBlob(config, asset.content),
        }))
      )
      const boardBlobSha = await createBlob(config, toBase64(serializedBoard))
      const commitSha = await commitTree(config, `mosaic: save ${board.title}`, [
        ...assetEntries,
        { path: boardPath(board.id), mode: '100644', type: 'blob', sha: boardBlobSha },
      ])
      return json(200, { commitSha })
    }

    if (request.action === 'delete') {
      try {
        await readBoard(config, request.id)
        const tree = await githubRequest(
          config,
          `/git/trees/${encodeURIComponent(config.branch)}?recursive=1`
        )
        const assetPrefix = `${ASSETS_DIRECTORY}/${request.id}/`
        const deletions = (tree.tree || [])
          .filter((entry) => entry.path === boardPath(request.id) || entry.path.startsWith(assetPrefix))
          .map((entry) => ({ path: entry.path, mode: '100644', type: 'blob', sha: null }))
        const commitSha = await commitTree(config, 'mosaic: delete board', deletions)
        return json(200, { commitSha })
      } catch (error) {
        if (error.statusCode === 404) return json(200, { deleted: false })
        throw error
      }
    }

    return json(400, { error: 'Unknown GitHub sync action.' })
  } catch (error) {
    console.error('GitHub board sync failed:', error)
    const statusCode = [400, 404, 409].includes(error.statusCode) ? error.statusCode : 500
    return json(statusCode, {
      error: error.message || 'GitHub board sync failed.',
      ...(statusCode === 409 ? { conflict: true } : {}),
    })
  }
}
