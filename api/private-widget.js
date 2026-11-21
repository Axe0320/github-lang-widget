import { createHash, timingSafeEqual } from 'node:crypto'
import { DEFAULT_OWNER, fetchAccountLanguageTotals } from '../lib/githubData.js'
import { json, LOAD_ERROR, PRIVATE_CACHE, query, requireGet } from '../lib/http.js'
import { buildLanguageStats } from '../lib/chartTree.js'
import { chartOptions, sendChart } from '../lib/renderChart.js'

let pendingStats

function isAuthorized(request) {
  const key = process.env.WIDGET_ACCESS_KEY
  const authorization = request.headers.authorization
  if (!key || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
  const digest = (value) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(authorization.slice(7)), digest(key))
}

function fetchStats(token) {
  // Coalesce simultaneous requests within this instance and discard the result on completion.
  pendingStats ??= fetchAccountLanguageTotals(DEFAULT_OWNER, { privateToken: token })
    .then(buildLanguageStats)
    .finally(() => { pendingStats = undefined })
  return pendingStats
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', PRIVATE_CACHE)
  response.setHeader('CDN-Cache-Control', 'no-store')
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store')
  if (!requireGet(request, response, PRIVATE_CACHE)) return
  if (!isAuthorized(request)) return json(response, 401, { error: 'Unauthorized' }, PRIVATE_CACHE)

  const params = query(request)
  const format = params.get('format') ?? 'png'
  const options = format === 'png' ? chartOptions(params) : null
  if (params.has('owner') || (format !== 'top' && !options)) {
    return json(response, 400, { error: 'Invalid widget parameters' }, PRIVATE_CACHE)
  }

  const token = process.env.GITHUB_PRIVATE_TOKEN
  if (!token) return json(response, 503, { error: 'Widget unavailable' }, PRIVATE_CACHE)

  let stats
  try {
    stats = await fetchStats(token)
  } catch {
    console.warn('Private GitHub language aggregation failed')
    return json(response, 502, { error: LOAD_ERROR }, PRIVATE_CACHE)
  }

  if (format === 'top') {
    const [top] = stats
    return json(response, 200, { top: top ? { name: top.name, percent: top.percent } : null }, PRIVATE_CACHE)
  }

  try {
    const chartStats = stats.length ? stats : [{ name: 'No language data', percent: 100, color: '#f85149' }]
    return await sendChart(response, DEFAULT_OWNER, chartStats, options, PRIVATE_CACHE)
  } catch {
    console.warn('Private chart rendering failed')
    return json(response, 500, { error: 'Failed to render chart' }, PRIVATE_CACHE)
  }
}
