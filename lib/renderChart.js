import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import satori from 'satori'
import { buildChartTree, THEMES } from './chartTree.js'

const FONT_PATH = path.join(process.cwd(), 'lib', 'fonts', 'Inter-Regular.ttf')
const WASM_PATH = createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')
let assets

function loadAssets() {
  assets ??= Promise.all([readFile(FONT_PATH), initWasm(readFile(WASM_PATH))])
  return assets
}

export function chartOptions(params) {
  const theme = params.get('theme') ?? 'dark'
  if (!Object.hasOwn(THEMES, theme)) return null

  const rowBars = params.get('rowBars') ?? '1'
  if (rowBars !== '0' && rowBars !== '1') return null

  const width = boundedNumber(params, 'w', 600, 1, 4096, true)
  const height = boundedNumber(params, 'h', 400, 1, 4096, true)
  const legendCount = boundedNumber(params, 'legendCount', 6, 0, 50, true)
  const boost = boundedNumber(params, 'boost', 1, 0.1, 4)
  const rowBarHeight = boundedNumber(params, 'rowBarHeight', 1, 0.1, 4)
  if ([width, height, legendCount, boost, rowBarHeight].includes(null)) return null
  if (width * height > 6_000_000) return null

  return { width, height, legendCount, boost, rowBarHeight, theme: THEMES[theme], rowBars: rowBars === '1' }
}

function boundedNumber(params, key, fallback, min, max, integer = false) {
  if (!params.has(key)) return fallback
  const raw = params.get(key)
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null
  const value = Number(raw)
  if (value < min || value > max || (integer && !Number.isInteger(value))) return null
  return value
}

export async function sendChart(response, owner, stats, options, cache) {
  const [fontData] = await loadAssets()
  // Render with local assets only, including when a language label has unsupported glyphs.
  const svg = await satori(buildChartTree({ owner, stats, ...options }), {
    width: options.width,
    height: options.height,
    fonts: [{ name: 'Inter', data: fontData, style: 'normal' }],
  })
  const renderer = new Resvg(svg)
  let rendered
  try {
    rendered = renderer.render()
    const png = Buffer.from(rendered.asPng())
    response.setHeader('Content-Type', 'image/png')
    response.setHeader('Cache-Control', cache)
    return response.status(200).send(png)
  } finally {
    rendered?.free()
    renderer.free()
  }
}
