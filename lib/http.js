export const PUBLIC_CACHE = 'public, max-age=1800, s-maxage=1800'
export const PRIVATE_CACHE = 'private, no-store'
export const LOAD_ERROR = 'Failed to load account languages'

export function query(request) {
  return new URL(request.url, 'https://localhost').searchParams
}

export function json(response, status, body, cache = 'no-store') {
  response.setHeader('Cache-Control', cache)
  return response.status(status).json(body)
}

export function requireGet(request, response, cache) {
  if (request.method === 'GET') return true
  response.setHeader('Allow', 'GET')
  json(response, 405, { error: 'Method not allowed' }, cache)
  return false
}
