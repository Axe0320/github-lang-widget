import { ImageResponse } from '@vercel/og'
import { DEFAULT_OWNER } from '../lib/githubData.js'
import { buildLanguageStats, buildSampleText, buildChartTree, THEMES } from '../lib/chartTree.js'

export const config = { runtime: 'edge' }

const DEFAULT_LEGEND_COUNT = 6

// Vercel's documented trick: fetch() has no browser UA, so Google Fonts' CSS API
// serves back a plain .ttf link instead of a modern .woff2 one.
async function loadGoogleFont(fontFamily, text) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    fontFamily
  )}&text=${encodeURIComponent(text)}`
  const css = await (await fetch(cssUrl)).text()
  const match = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)
  if (!match) throw new Error('Could not resolve font file URL from Google Fonts CSS')
  const fontRes = await fetch(match[1])
  if (!fontRes.ok) throw new Error('Failed to download font file')
  return fontRes.arrayBuffer()
}

// Goes through api/data.js (same deployment) instead of GitHub directly, so
// that endpoint's own cache is what actually limits how often GitHub gets
// hit — shared across every differently-sized/themed chart request, not
// re-fetched per request the way it was when this file called GitHub itself.
async function fetchStats(request, owner) {
  const dataUrl = new URL(`/api/data?owner=${encodeURIComponent(owner)}`, request.url)
  const res = await fetch(dataUrl)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return buildLanguageStats(data.totals)
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url)
  const owner = searchParams.get('owner') || DEFAULT_OWNER
  const width = Number(searchParams.get('w')) || 600
  const height = Number(searchParams.get('h')) || 400
  const legendCountParam = searchParams.get('legendCount')
  const legendCount = legendCountParam === null ? DEFAULT_LEGEND_COUNT : Number(legendCountParam)
  const themeName = searchParams.get('theme') === 'light' ? 'light' : 'dark'
  const theme = THEMES[themeName]
  // Matches my-intro/index.js's per-row lang-row-bar. Widget-side, small
  // leaves this off (too little width to spare); medium and up turn it on.
  const rowBars = searchParams.get('rowBars') !== '0'
  const boostParam = Number(searchParams.get('boost'))
  const boost = Number.isFinite(boostParam) && boostParam > 0 ? boostParam : 1
  const rowBarHeightParam = Number(searchParams.get('rowBarHeight'))
  const rowBarHeight =
    Number.isFinite(rowBarHeightParam) && rowBarHeightParam > 0 ? rowBarHeightParam : 1

  let stats
  let errorMessage = null
  try {
    stats = await fetchStats(request, owner)
    if (stats.length === 0) {
      errorMessage = 'No language data'
    }
  } catch (e) {
    errorMessage = e.message || 'Failed to load account languages'
  }

  if (errorMessage) {
    stats = [{ name: errorMessage, percent: 100, color: '#f85149' }]
  }

  const fontData = await loadGoogleFont('Inter', buildSampleText(stats))

  const tree = buildChartTree({
    owner,
    stats,
    width,
    height,
    legendCount,
    theme,
    rowBars,
    boost,
    rowBarHeight,
  })

  return new ImageResponse(tree, {
    width,
    height,
    fonts: [{ name: 'Inter', data: fontData, style: 'normal' }],
    headers: {
      // A transient failure (e.g. a GitHub rate limit) must never be cached
      // as if it were good data — that would freeze the error in place for
      // the full cache lifetime everywhere this image is embedded.
      'Cache-Control': errorMessage
        ? 'no-store'
        : 'public, max-age=1800, s-maxage=1800',
    },
  })
}
