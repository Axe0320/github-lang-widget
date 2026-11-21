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
    if (!Keychain.contains(KEYCHAIN_KEY)) {
      throw new PreviewError("この URL のキーが未登録です。Set access key を実行してください。")
    }
    const key = Keychain.get(KEYCHAIN_KEY)
    request.headers = { Authorization: `Bearer ${key}` }
    request.onRedirect = () => null
  }
  return request
}

class PreviewError extends Error {}

function imageRequestError(request) {
  const status = request.response?.statusCode
  const headers = Object.entries(request.response?.headers || {})
  const contentType = headers.find(([name]) => name.toLowerCase() === "content-type")?.[1] || ""
  if (((status === 401 || status === 403) && /text\/html/i.test(contentType)) ||
      (status >= 300 && status < 400)) {
    return new PreviewError(`Vercel のログイン保護で止まりました（HTTP ${status}）。`)
  }
  if (status === 401) {
    return new PreviewError("ウィジェット専用キーが拒否されました（HTTP 401）。")
  }
  if (status === 503) {
    return new PreviewError("このデプロイの Private 集計用設定が不足しています（HTTP 503）。")
  }
  if (status === 502) {
    return new PreviewError("Vercel は応答しましたが、GitHub の集計に失敗しました（HTTP 502）。")
  }
  return new PreviewError(status
    ? `PNG を取得できませんでした（HTTP ${status}）。`
    : "サーバーから応答を取得できませんでした。URL と通信状態を確認してください。")
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
  let image
  try {
    image = await request.loadImage()
  } catch {
    throw imageRequestError(request)
  }
  if (request.response?.statusCode !== 200) throw imageRequestError(request)

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

  try {
    const widget = await createWidget()
    if (config.runsInWidget) Script.setWidget(widget)
    else await widget.presentMedium()
  } catch (error) {
    if (config.runsInWidget) {
      const fallback = new ListWidget()
      fallback.addText("N/A")
      Script.setWidget(fallback)
      return
    }
    const alert = new Alert()
    alert.title = "プレビューを取得できません"
    alert.message = error instanceof PreviewError ? error.message : "ウィジェットの設定を確認してください。"
    alert.addAction("OK")
    await alert.presentAlert()
  }
}

;(async () => {
  try {
    await main()
  } finally {
    Script.complete()
  }
})()
