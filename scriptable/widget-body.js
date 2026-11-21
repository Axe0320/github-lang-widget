// For Private mode, paste this entire file into a Scriptable script directly.
const API_ORIGIN = "https://github-lang-widget.vercel.app"
const OWNER = "Axe0320"
const INCLUDE_PRIVATE = false
const SHOW_PRIVATE_ON_LOCK_SCREEN = false
const KEYCHAIN_KEY = `github-lang-widget:${API_ORIGIN}`

async function setAccessKey() {
  const prompt = new Alert()
  prompt.title = "Widget access key"
  prompt.addSecureTextField("Access key")
  prompt.addAction("Save")
  prompt.addCancelAction("Cancel")
  if (await prompt.presentAlert() === 0) {
    const key = prompt.textFieldValue(0).trim()
    if (key) Keychain.set(KEYCHAIN_KEY, key)
  }
}

function widgetRequest(path, usePrivate = false) {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(API_ORIGIN)) throw new Error("Invalid API origin")
  const request = new Request(API_ORIGIN + path)
  if (usePrivate) {
    const key = Keychain.get(KEYCHAIN_KEY)
    request.headers = { Authorization: `Bearer ${key}` }
    request.onRedirect = () => null
  }
  return request
}

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

async function fetchTopLanguage() {
  if (INCLUDE_PRIVATE && SHOW_PRIVATE_ON_LOCK_SCREEN) {
    const request = widgetRequest("/api/private-widget?format=top", true)
    const data = await request.loadJSON()
    if (request.response.statusCode !== 200) throw new Error("Widget unavailable")
    return data.top
  }

  const request = widgetRequest(`/api/data?owner=${encodeURIComponent(OWNER)}`)
  const { totals } = await request.loadJSON()
  if (request.response.statusCode !== 200) throw new Error("Widget unavailable")
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
  // A flat "2x" undersells 3x devices (iPhone Pro/Pro Max, older Plus models),
  // where the image comes back lower-resolution than the screen can actually
  // show. Device.screenScale() gives the real per-device pixel density (2 or
  // 3) instead of guessing.
  const pixelScale = Device.screenScale()
  const reqW = Math.round(w * pixelScale)
  const reqH = Math.round(h * pixelScale)
  const endpoint = INCLUDE_PRIVATE
    ? "/api/private-widget?format=png"
    : `/api/chart?owner=${encodeURIComponent(OWNER)}`
  const url = `${endpoint}&w=${reqW}&h=${reqH}&legendCount=${legendCount}&theme=${theme}&rowBars=${
    rowBars ? 1 : 0
  }&boost=${boost}&rowBarHeight=${rowBarHeight}`
  const request = widgetRequest(url, INCLUDE_PRIVATE)
  const image = await request.loadImage()
  if (request.response.statusCode !== 200) throw new Error("Widget unavailable")

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

async function main() {
  if (INCLUDE_PRIVATE && !config.runsInWidget) {
    const menu = new Alert()
    menu.title = "GitHub Lang Widget"
    menu.addAction("Preview")
    menu.addAction("Set access key")
    menu.addCancelAction("Cancel")
    const action = await menu.presentAlert()
    if (action === 1) return setAccessKey()
    if (action !== 0) return
  }

  const widget = await createWidget().catch(() => {
    const fallback = new ListWidget()
    fallback.addText("N/A")
    return fallback
  })

  if (config.runsInWidget) {
    Script.setWidget(widget)
  } else {
    await widget.presentMedium()
  }
}

;(async () => {
  try {
    await main()
  } finally {
    Script.complete()
  }
})()
