export const DEFAULT_OWNER = 'Axe0320'
export const OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i

const GITHUB_API = 'https://api.github.com'
const CONCURRENCY = 8

async function githubRequest(path, token, signal) {
  const headers = {
    'User-Agent': 'github-lang-widget',
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(new URL(path, GITHUB_API), {
    headers,
    signal,
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('GitHub request failed')
  return response
}

async function* listRepositories(path, query, token, signal) {
  const url = new URL(path, GITHUB_API)
  url.search = new URLSearchParams({ ...query, per_page: 100, sort: 'full_name' })
  let page = 1
  while (true) {
    url.searchParams.set('page', page)
    const response = await githubRequest(url, token, signal)
    const repositories = await response.json()
    if (!Array.isArray(repositories)) throw new Error('Invalid repository list')
    yield* repositories

    const next = response.headers.get('Link')?.match(/<([^>]+)>;\s*rel="next"/i)
    if (!next) return
    const nextPage = Number(new URL(next[1]).searchParams.get('page'))
    if (!Number.isSafeInteger(nextPage) || nextPage !== page + 1) {
      throw new Error('Invalid GitHub pagination')
    }
    // Keep the original GitHub endpoint and filters for every request.
    page = nextPage
  }
}

export async function fetchAccountLanguageTotals(owner, { privateToken } = {}) {
  if (!OWNER_PATTERN.test(owner)) throw new Error('Invalid owner')

  const signal = AbortSignal.timeout(45_000)
  const publicToken = privateToken || process.env.GITHUB_TOKEN
  const repositories = new Map()
  const normalizedOwner = owner.toLowerCase()
  const publicPath = `/users/${owner}/repos`

  function addRepository(repo, isPrivate, token) {
    if (repo.private !== isPrivate || repo.owner?.login?.toLowerCase() !== normalizedOwner) return
    repositories.set(repo.id, { name: repo.name, token })
  }

  if (privateToken) {
    const response = await githubRequest('/user', privateToken, signal)
    const account = await response.json()
    if (account.login?.toLowerCase() !== normalizedOwner) throw new Error('Unexpected GitHub account')
  }

  for await (const repo of listRepositories(publicPath, { type: 'owner' }, publicToken, signal)) {
    addRepository(repo, false, publicToken)
  }
  if (privateToken) {
    const query = { visibility: 'private', affiliation: 'owner' }
    for await (const repo of listRepositories('/user/repos', query, privateToken, signal)) {
      addRepository(repo, true, privateToken)
    }
  }

  const totals = Object.create(null)
  const pending = Array.from(repositories.values())
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async ({ name, token }) => {
      const path = `/repos/${owner}/${encodeURIComponent(name)}/languages`
      const response = await githubRequest(path, token, signal)
      return response.json()
    }))
    for (const langs of results) {
      if (!langs || typeof langs !== 'object' || Array.isArray(langs)) {
        throw new Error('Invalid language totals')
      }
      for (const [lang, bytes] of Object.entries(langs)) {
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid language bytes')
        totals[lang] = (totals[lang] || 0) + bytes
      }
    }
  }
  return totals
}
