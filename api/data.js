import { DEFAULT_OWNER, OWNER_PATTERN } from '../lib/githubData.js'
import { json, LOAD_ERROR, PUBLIC_CACHE, query, requireGet } from '../lib/http.js'
import { getPublicTotals } from '../lib/publicTotals.js'

export default async function handler(request, response) {
  if (!requireGet(request, response)) return
  const owner = query(request).get('owner') || DEFAULT_OWNER
  if (!OWNER_PATTERN.test(owner)) return json(response, 400, { error: 'Invalid owner' })

  try {
    const totals = await getPublicTotals(owner)
    return json(response, 200, { totals }, PUBLIC_CACHE)
  } catch {
    console.warn('Public GitHub language aggregation failed')
    return json(response, 502, { error: LOAD_ERROR })
  }
}
