export const DEFAULT_OWNER = 'Axe0320'

// Same approach as my-intro/index.js's loadGitHubRepos(): list every public
// repo for the account, then fetch + sum each repo's languages_url in parallel.
export async function fetchAccountLanguageTotals(owner) {
  const headers = {
    'User-Agent': 'github-lang-widget',
    Accept: 'application/vnd.github+json',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const reposRes = await fetch(
    `https://api.github.com/users/${owner}/repos?sort=updated&per_page=100`,
    { headers }
  )
  if (!reposRes.ok) throw new Error(`GitHub API error: ${reposRes.status}`)
  const repos = await reposRes.json()

  const langTotalsList = await Promise.all(
    repos.map((repo) =>
      fetch(repo.languages_url, { headers }).then((res) => (res.ok ? res.json() : {}))
    )
  )

  const totals = {}
  langTotalsList.forEach((langs) => {
    Object.entries(langs).forEach(([lang, bytes]) => {
      totals[lang] = (totals[lang] || 0) + bytes
    })
  })
  return totals
}
