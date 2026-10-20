const DEFAULT_REPOSITORY = 'pradeepgithubrepo/mosaic_personal_whiteboard'
const DEFAULT_BRANCH = 'master'
const BOARDS_DIRECTORY = '.mosaic/boards'
const MAX_BOARD_BYTES = 900_000

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

const githubPath = (path) => path.split('/').map(encodeURIComponent).join('/')

const toBase64 = (value) => Buffer.from(value, 'utf8').toString('base64')

const fromBase64 = (value) => Buffer.from(value.replace(/\n/g, ''), 'base64').toString('utf8')

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
    throw new Error('Invalid board payload.')
  }
  if (typeof board.title !== 'string' || !board.title.trim()) {
    throw new Error('A board title is required.')
  }

  const serialized = JSON.stringify(board)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BOARD_BYTES) {
    throw new Error('This board is too large to commit through GitHub sync. Remove or reduce embedded media first.')
  }

  return serialized
}

const boardPath = (id) => `${BOARDS_DIRECTORY}/${id}.json`

const readBoard = async (config, id) => {
  const file = await githubRequest(
    config,
    `/contents/${githubPath(boardPath(id))}?ref=${encodeURIComponent(config.branch)}`
  )
  return { board: JSON.parse(fromBase64(file.content)), sha: file.sha }
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

    if (request.action === 'commit') {
      const content = validateBoard(request.board)
      const path = boardPath(request.board.id)
      let sha
      try {
        sha = (await readBoard(config, request.board.id)).sha
      } catch (error) {
        if (error.statusCode !== 404) throw error
      }

      const result = await githubRequest(config, `/contents/${githubPath(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `mosaic: save ${request.board.title}`,
          content: toBase64(content),
          branch: config.branch,
          ...(sha ? { sha } : {}),
        }),
      })
      return json(200, { commitSha: result.commit.sha })
    }

    if (request.action === 'delete') {
      try {
        const { sha } = await readBoard(config, request.id)
        const result = await githubRequest(config, `/contents/${githubPath(boardPath(request.id))}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'mosaic: delete board',
            sha,
            branch: config.branch,
          }),
        })
        return json(200, { commitSha: result.commit.sha })
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
