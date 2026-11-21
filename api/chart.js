import { DEFAULT_OWNER, OWNER_PATTERN } from '../lib/githubData.js'
import { json, LOAD_ERROR, PUBLIC_CACHE, query, requireGet } from '../lib/http.js'
import { buildLanguageStats } from '../lib/chartTree.js'
import { getPublicTotals } from '../lib/publicTotals.js'
import { chartOptions, sendChart } from '../lib/renderChart.js'

export default async function handler(request, response) {
  if (!requireGet(request, response)) return
  const params = query(request)
  const owner = params.get('owner') || DEFAULT_OWNER
  const options = chartOptions(params)
  if (!OWNER_PATTERN.test(owner) || !options) {
    return json(response, 400, { error: 'Invalid chart parameters' })
  }

  let stats
  let error
  try {
    stats = buildLanguageStats(await getPublicTotals(owner))
    if (!stats.length) error = 'No language data'
  } catch {
    console.warn('Public GitHub language aggregation failed')
    error = LOAD_ERROR
  }

  try {
    if (error) stats = [{ name: error, percent: 100, color: '#f85149' }]
    return await sendChart(response, owner, stats, options, error ? 'no-store' : PUBLIC_CACHE)
  } catch {
    console.warn('Public chart rendering failed')
    return json(response, 500, { error: 'Failed to render chart' })
  }
}
