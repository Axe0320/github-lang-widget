import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const DEFAULT_OWNER = 'Axe0320'
// How many of the account-wide languages also get a text row (name + %) below
// the bar. This is what varies per widget size (0 = bar only, no legend).
const DEFAULT_LEGEND_COUNT = 6
// Below this, a language's true percentage renders as a sliver too thin to
// see (or even 0 device pixels) — it looks omitted even though it's still in
// the data. Floor each segment's on-screen width here, then renormalize the
// whole bar back to 100% so the boost doesn't push later segments off the
// (overflow: hidden) edge.
const MIN_BAR_PERCENT = 0.6
// Reference canvas size that the base font/spacing numbers below were tuned for.
// Requests for a bigger or smaller canvas scale everything proportionally,
// instead of leaving a fixed-size chart floating in empty space.
const BASE_SIZE = 600

// Mirrors the LANG_COLORS map in my-intro's own index.js, so the widget's bar
// matches the colors already used on the site itself.
const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Sass: '#a53b70',
  Python: '#3572a5',
  'Jupyter Notebook': '#da5b0b',
  R: '#198ce7',
  Java: '#b07219',
  Kotlin: '#a97bff',
  Scala: '#c22d40',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Rust: '#dea584',
  Go: '#00add8',
  Swift: '#f05138',
  Dart: '#00b4ab',
  Shell: '#89e051',
  Batchfile: '#c1f12e',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Lua: '#000080',
  Perl: '#0298c3',
  PureBasic: '#5a6986',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
}
const FALLBACK_COLOR = '#8b8b8b'

const THEMES = {
  dark: {
    background: '#0d1117',
    heading: '#8b949e',
    legendName: '#e6edf3',
    legendPercent: '#8b949e',
    rowTrack: '#21262d',
  },
  light: {
    background: '#ffffff',
    heading: '#57606a',
    legendName: '#1f2328',
    legendPercent: '#57606a',
    rowTrack: '#eaeef2',
  },
}

// Builds a satori-compatible element tree without needing React/JSX at build time.
function el(type, props, children) {
  return { type, props: { ...props, children } }
}

// satori doesn't reliably clip text via overflow:hidden + a fixed width — long
// content (e.g. "TypeScript", or a long error message) can shrink the box
// itself instead of being clipped, throwing off every sibling's position.
// Truncating the string up front sidesteps that entirely.
function truncate(text, maxChars) {
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
}

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

// Same approach as my-intro/index.js's loadGitHubRepos(): list every public
// repo for the account, then fetch + sum each repo's languages_url in parallel.
async function fetchAccountLanguageTotals(owner) {
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

function buildLanguageStats(totals) {
  const total = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0)
  if (total === 0) return []

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({
      name,
      percent: (bytes / total) * 100,
      color: LANG_COLORS[name] || FALLBACK_COLOR,
    }))
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
  // Scale text/bar/spacing relative to how big the requested canvas is, so a
  // "large" widget actually looks bigger and more detailed, not just zoomed-out.
  const scale = Math.min(width, height) / BASE_SIZE
  // `boost` thickens the bar and enlarges legend text/dots/margins on top of
  // `scale`, for sizes that still look sparse. It's kept separate from the
  // fixed pixel widths below (name/percent columns), which stay tied to
  // `scale` alone — boosting those too would blow the row past the canvas's
  // actual width instead of just making it more readable.
  const boostParam = Number(searchParams.get('boost'))
  const boost = Number.isFinite(boostParam) && boostParam > 0 ? boostParam : 1
  const boosted = scale * boost

  let stats
  let errorMessage = null
  try {
    const totals = await fetchAccountLanguageTotals(owner)
    stats = buildLanguageStats(totals)
    if (stats.length === 0) {
      errorMessage = 'No language data'
    }
  } catch (e) {
    errorMessage = e.message || 'Failed to load account languages'
  }

  if (errorMessage) {
    stats = [{ name: errorMessage, percent: 100, color: '#f85149' }]
  }

  // The bar always shows every language (matches index.js exactly). The legend
  // is a widget-only concession to limited space, so it's the one that gets cut.
  const legendStats = stats.slice(0, Math.max(0, legendCount))

  const sampleText =
    stats.map((s) => `${s.name} ${s.percent.toFixed(1)}%`).join(' ') +
    ' abcdefghijklmnopqrstuvwxyz0123456789.%/'
  const fontData = await loadGoogleFont('Inter', sampleText)

  // Give tiny languages a floor width, then renormalize back to 100% so the
  // boost doesn't push the total past the bar's clipped edge.
  const flooredPercents = stats.map((s) => Math.max(s.percent, MIN_BAR_PERCENT))
  const flooredTotal = flooredPercents.reduce((sum, v) => sum + v, 0)
  const barWidths = flooredPercents.map((v) => (v / flooredTotal) * 100)

  const barSegments = stats.map((s, i) =>
    el('div', {
      key: s.name,
      style: { width: `${barWidths[i]}%`, backgroundColor: s.color, display: 'flex' },
    })
  )

  // Ratio of box width to fontSize is constant regardless of `boosted` (both
  // scale together), so a fixed character budget works for every size.
  const nameMaxChars = rowBars ? 15 : 16

  const legendRows = legendStats.map((s) => {
    const rowChildren = [
      el('div', {
        style: {
          width: Math.round(14 * boosted),
          height: Math.round(14 * boosted),
          borderRadius: Math.round(7 * boosted),
          backgroundColor: s.color,
          marginRight: Math.round(10 * boosted),
          display: 'flex',
        },
      }),
      el(
        'div',
        {
          style: {
            color: theme.legendName,
            display: 'flex',
            // Fixed width (instead of flex: 1) so there's room left for the
            // row's own bar when rowBars is on. Tied to `boosted` (not just
            // `scale`) so the box grows in step with the font size it holds.
            width: Math.round((rowBars ? 220 : 230) * boosted),
            whiteSpace: 'nowrap',
          },
        },
        truncate(s.name, nameMaxChars)
      ),
    ]

    if (rowBars) {
      rowChildren.push(
        el(
          'div',
          {
            style: {
              flexGrow: 1,
              height: Math.round(8 * boosted),
              borderRadius: Math.round(4 * boosted),
              backgroundColor: theme.rowTrack,
              overflow: 'hidden',
              marginRight: Math.round(12 * boosted),
              display: 'flex',
            },
          },
          [
            el('div', {
              style: {
                width: `${s.percent}%`,
                height: '100%',
                backgroundColor: s.color,
                display: 'flex',
              },
            }),
          ]
        )
      )
    }

    rowChildren.push(
      el(
        'div',
        {
          style: {
            color: theme.legendPercent,
            display: 'flex',
            width: Math.round(64 * boosted),
            justifyContent: 'flex-end',
          },
        },
        `${s.percent.toFixed(1)}%`
      )
    )

    return el(
      'div',
      {
        key: s.name,
        style: {
          display: 'flex',
          alignItems: 'center',
          fontSize: Math.round(20 * boosted),
          marginBottom: Math.round(12 * boosted),
        },
      },
      rowChildren
    )
  })

  const children = [
    el(
      'div',
      {
        style: {
          display: 'flex',
          color: theme.heading,
          fontSize: Math.round(18 * boosted),
          marginBottom: Math.round(16 * boosted),
        },
      },
      owner
    ),
    el(
      'div',
      {
        style: {
          display: 'flex',
          width: '100%',
          height: Math.round(22 * boosted),
          borderRadius: Math.round(11 * boosted),
          overflow: 'hidden',
          // No legend below means the bar is the last element — skip its margin.
          marginBottom: legendStats.length > 0 ? Math.round(24 * boosted) : 0,
        },
      },
      barSegments
    ),
  ]
  if (legendStats.length > 0) {
    children.push(el('div', { style: { display: 'flex', flexDirection: 'column' } }, legendRows))
  }

  const tree = el(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: `${Math.round(28 * scale)}px`,
        backgroundColor: theme.background,
        fontFamily: 'Inter',
      },
    },
    children
  )

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
