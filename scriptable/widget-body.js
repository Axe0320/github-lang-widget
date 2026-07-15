// This file is fetched over the network and eval()'d by loader.js at widget
// refresh time — it is NOT pasted into Scriptable directly. Edit here,
// `vercel --prod`, and the widget picks it up on its next refresh.

const API_BASE = "https://github-lang-widget.vercel.app/api/chart"
const OWNER = "Axe0320"

// Home Screen / iPad widget sizes: rendered via the PNG chart from api/chart.js.
// The bar itself always shows the same overall breakdown; legendCount controls
// how many per-language text rows are listed below it (0 = bar only). rowBars
// adds my-intro's per-language mini bar next to each row — off on small,
// where there isn't enough width to spare for it. boost thickens the bar and
// enlarges the legend text/dots/rows on top of the usual size-based scaling —
// tuned per family since how much empty space is left varies a lot by size
// (api/chart.js automatically caps it back down if a row count wouldn't fit,
// so these can stay generous). rowBarHeight thickens just the per-row mini
// bar on top of that.
const IMAGE_SIZE_MAP = {
  small: { w: 300, h: 300, legendCount: 5, rowBars: false, boost: 1.7, rowBarHeight: 1 },
  medium: { w: 640, h: 300, legendCount: 5, rowBars: true, boost: 1.6, rowBarHeight: 1.8 },
  large: { w: 640, h: 640, legendCount: 15, rowBars: true, boost: 1.15, rowBarHeight: 1 },
  extraLarge: { w: 1024, h: 640, legendCount: 15, rowBars: true, boost: 1.05, rowBarHeight: 1 }, // iPad Home Screen only
}

// Lock Screen widgets: iOS forces these to render monochrome/tinted, so an
// image chart would just look like a gray blob. Fall back to plain text.
const ACCESSORY_FAMILIES = new Set([
  "accessoryCircular",
  "accessoryRectangular",
  "accessoryInline",
])

// Long-press the widget → Edit Widget → Parameter, and type "light"/"white"
// (or "白"/"ホワイト"/"ライト") to switch it. Anything else (or left blank)
// stays "dark" — "dark"/"black"/"黒"/"ブラック"/"ダーク" also work explicitly.
const LIGHT_WORDS = new Set(["light", "white", "白", "ホワイト", "ライト"])
function resolveTheme() {
  const param = (args.widgetParameter || "").trim().toLowerCase()
  return LIGHT_WORDS.has(param) ? "light" : "dark"
}

// Mirrors my-intro/index.js's loadGitHubRepos(): sum languages_url across every
// public repo for the account, rather than just one repo.
async function fetchTopLanguage() {
  const repos = await new Request(
    `https://api.github.com/users/${OWNER}/repos?sort=updated&per_page=100`
  ).loadJSON()

  const langTotalsList = await Promise.all(
    repos.map((repo) => new Request(repo.languages_url).loadJSON())
  )

  const totals = {}
  langTotalsList.forEach((langs) => {
    Object.entries(langs).forEach(([lang, bytes]) => {
      totals[lang] = (totals[lang] || 0) + bytes
    })
  })

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0)
  const [name, bytes] = entries[0]
  return { name, percent: (bytes / total) * 100 }
}

async function createAccessoryWidget(family) {
  const widget = new ListWidget()
  const top = await fetchTopLanguage().catch(() => null)
  const text = top ? `${top.name} ${top.percent.toFixed(0)}%` : "N/A"

  if (family === "accessoryInline") {
    widget.addText(text)
    return widget
  }

  const label = widget.addText("Top Lang")
  label.font = Font.systemFont(11)
  widget.addSpacer(4)
  const value = widget.addText(text)
  value.font = Font.boldSystemFont(family === "accessoryCircular" ? 14 : 18)
  return widget
}

async function createImageWidget(family) {
  const { w, h, legendCount, rowBars, boost, rowBarHeight } =
    IMAGE_SIZE_MAP[family] || IMAGE_SIZE_MAP.medium
  const theme = resolveTheme()
  // Request at 2x for Retina sharpness.
  const url = `${API_BASE}?owner=${encodeURIComponent(OWNER)}&w=${w * 2}&h=${
    h * 2
  }&legendCount=${legendCount}&theme=${theme}&rowBars=${
    rowBars ? 1 : 0
  }&boost=${boost}&rowBarHeight=${rowBarHeight}`
  const image = await new Request(url).loadImage()

  const widget = new ListWidget()
  widget.backgroundImage = image
  return widget
}

async function createWidget() {
  const family = config.widgetFamily || "medium"
  if (ACCESSORY_FAMILIES.has(family)) {
    return createAccessoryWidget(family)
  }
  return createImageWidget(family)
}

// loader.js runs this file via eval(), and indirect eval doesn't allow
// top-level await (only Scriptable's own top-level script files do) — so
// everything async has to happen inside a function body, not at this scope.
;(async () => {
  const widget = await createWidget()

  if (config.runsInWidget) {
    Script.setWidget(widget)
  } else {
    await widget.presentMedium()
  }
  Script.complete()
})()
