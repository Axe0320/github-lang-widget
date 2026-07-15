// Mirrors the LANG_COLORS map in my-intro's own index.js, so the widget's bar
// matches the colors already used on the site itself.
export const LANG_COLORS = {
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
export const FALLBACK_COLOR = '#8b8b8b'

export const THEMES = {
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

// Reference canvas size that the base font/spacing numbers below were tuned for.
export const BASE_SIZE = 600
// Below this, a language's true percentage renders as a sliver too thin to
// see (or even 0 device pixels). Floor each segment's on-screen width here,
// then renormalize the whole bar back to 100% so the boost doesn't push
// later segments off the (overflow: hidden) edge.
const MIN_BAR_PERCENT = 0.6
// Empirically measured (not guessed): header+bar block height, and each
// legend row's height, per unit of `boosted`. Used to auto-shrink `boosted`
// when a size asks for many rows (e.g. 15) so they always fit the canvas,
// instead of needing a hand-tuned boost per legendCount.
const FIXED_BLOCK_UNIT = 86
const ROW_UNIT = 36

export function buildLanguageStats(totals) {
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

export function buildSampleText(stats) {
  return (
    stats.map((s) => `${s.name} ${s.percent.toFixed(1)}%`).join(' ') +
    ' abcdefghijklmnopqrstuvwxyz0123456789.%/'
  )
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

export function buildChartTree({
  owner,
  stats,
  width,
  height,
  legendCount,
  theme,
  rowBars,
  boost,
  rowBarHeight,
}) {
  const scale = Math.min(width, height) / BASE_SIZE
  const legendStats = stats.slice(0, Math.max(0, legendCount))

  // Cap boosted so however many rows were asked for still fit the canvas,
  // even if the size's preferred `boost` would otherwise overflow it. Only
  // caps DOWN — a size with room to spare still gets its full boost.
  const rawBoosted = scale * boost
  const availableHeight = height - 2 * 28 * scale
  const boostedMax =
    legendStats.length > 0
      ? (availableHeight * 0.92) / (FIXED_BLOCK_UNIT + ROW_UNIT * legendStats.length)
      : Infinity
  const boosted = Math.min(rawBoosted, boostedMax)

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
            flexShrink: 0,
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
              // Explicit flexShrink/flexBasis (instead of just flexGrow: 1)
              // to avoid flex-basis: auto — with a percentage-width child
              // inside, that's a known circular-sizing edge case, and this
              // element's basis being miscomputed for one row was exactly
              // what threw off every sibling's position on that row.
              flexShrink: 1,
              flexBasis: '0%',
              height: Math.round(8 * boosted * rowBarHeight),
              borderRadius: Math.round(4 * boosted * rowBarHeight),
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
            flexShrink: 0,
            justifyContent: 'flex-end',
            // No row-bar to fill the gap (small) — push the percent all the
            // way to the row's own right edge instead of hugging the name.
            marginLeft: rowBars ? 0 : 'auto',
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

  return el(
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
}
