import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import chart from '../api/chart.js'
import data from '../api/data.js'
import privateWidget from '../api/private-widget.js'
import { fetchAccountLanguageTotals } from '../lib/githubData.js'
import { buildChartTree, buildLanguageStats, FALLBACK_COLOR, THEMES } from '../lib/chartTree.js'

const accessKey = 'fixture-widget-key'
const githubPrivateToken = 'fixture-private-token'
const owner = 'Axe0320'
const sizes = [
  ['small', 300, 300, 5, 0, 1.7, 1],
  ['medium', 640, 300, 5, 1, 1.6, 1.8],
  ['large', 640, 640, 15, 1, 1.15, 1],
  ['extraLarge', 1024, 640, 15, 1, 1.05, 1],
]
const accessories = ['accessoryCircular', 'accessoryRectangular', 'accessoryInline']

async function call(handler, url, key) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = JSON.parse(JSON.stringify(body)) },
    send(body) { this.body = body },
  }
  await handler({
    method: 'GET', url, headers: key ? { authorization: `Bearer ${key}` } : {},
  }, response)
  return response
}

function githubFixture(t) {
  const calls = []
  let failure = null
  const repos = (login, number, isPrivate = false) => Array.from({ length: number }, (_, i) => ({
    id: i + (isPrivate ? 1000 : 1),
    name: `${isPrivate ? 'private' : 'public'}-${i}`,
    private: isPrivate,
    owner: { login },
    languages_url: 'https://example.invalid/never-used',
  }))

  const list = (url, records) => {
    const page = Number(url.searchParams.get('page'))
    assert.equal(url.searchParams.get('per_page'), '100')
    const next = new URL(url)
    next.searchParams.set('page', page + 1)
    const headers = records.length > page * 100 ? { Link: `<${next}>; rel="next"` } : {}
    return Response.json(records.slice((page - 1) * 100, page * 100), { headers })
  }

  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://api.github.com', 'no outbound font or non-GitHub requests')
    assert.equal(options.redirect, 'error')
    calls.push(url.pathname + url.search)
    if (failure && url.pathname.endsWith(failure)) return new Response(null, { status: 403 })

    if (url.pathname === '/user' || url.pathname === '/user/repos' || url.pathname.includes('/private-')) {
      assert.equal(options.headers.Authorization, `Bearer ${githubPrivateToken}`)
    }
    if (url.pathname === '/user') return Response.json({ login: owner })
    if (url.pathname === '/user/repos') {
      assert.equal(url.searchParams.get('visibility'), 'private')
      assert.equal(url.searchParams.get('affiliation'), 'owner')
      const records = repos(owner, 101, true)
      return list(url, [...records, { ...records[0] }, ...repos('other', 1, true)])
    }
    const publicList = url.pathname.match(/^\/users\/([^/]+)\/repos$/)
    if (publicList) return list(url, repos(publicList[1], publicList[1] === owner ? 101 : 1))
    if (url.pathname.includes('/private-')) return Response.json({ Python: 2 })
    if (url.pathname.includes('/public-')) return Response.json({ JavaScript: 1 })
    throw new Error('Unexpected GitHub request')
  })
  return { calls, fail: (suffix) => { failure = suffix } }
}

test('pagination, authorization, caching and rendering with fixture data', async (t) => {
  process.env.WIDGET_ACCESS_KEY = accessKey
  process.env.GITHUB_PRIVATE_TOKEN = githubPrivateToken
  t.after(() => {
    delete process.env.WIDGET_ACCESS_KEY
    delete process.env.GITHUB_PRIVATE_TOKEN
  })
  const fixture = githubFixture(t)
  const topPath = '/api/private-widget?format=top'
  const noStore = (result) => {
    assert.equal(result.headers['cache-control'], 'private, no-store')
    assert.equal(result.headers['vercel-cdn-cache-control'], 'no-store')
  }

  let result = await call(privateWidget, topPath)
  assert.equal(result.statusCode, 401)
  noStore(result)
  assert.equal((await call(privateWidget, topPath, 'incorrect')).statusCode, 401)
  assert.equal((await call(privateWidget, topPath + '&owner=other', accessKey)).statusCode, 400)
  assert.equal(fixture.calls.length, 0)

  result = await call(privateWidget, topPath, accessKey)
  assert.equal(result.statusCode, 200)
  noStore(result)
  assert.deepEqual(result.body, { top: { name: 'Python', percent: 202 / 303 * 100 } })
  assert.equal(fixture.calls.filter((url) => url.includes('/private-') && url.endsWith('/languages')).length, 101)
  assert.equal(fixture.calls.filter((url) => url.includes('/public-') && url.endsWith('/languages')).length, 101)
  assert.equal((await call(privateWidget, topPath)).statusCode, 401)
  assert.deepEqual((await call(data, '/api/data?format=top', accessKey)).body, { totals: { JavaScript: 101 } })
  assert.equal((await call(chart, '/api/chart?w=4096&h=4096')).statusCode, 400)
  assert.equal((await call(data, '/api/data?owner=%2F')).statusCode, 400)

  fixture.fail('/private-100/languages')
  result = await call(privateWidget, topPath, accessKey)
  assert.equal(result.statusCode, 502)
  noStore(result)
  assert.deepEqual(result.body, { error: 'Failed to load account languages' })
  fixture.fail(null)
  assert.equal((await call(privateWidget, topPath, accessKey)).statusCode, 200)

  const publicPng = await call(chart, '/api/chart')
  const privatePng = await call(privateWidget, '/api/private-widget', accessKey)
  assert.equal(privatePng.statusCode, 200)
  noStore(privatePng)
  assert.equal(privatePng.headers['content-type'], 'image/png')
  assert.notDeepEqual(privatePng.body, publicPng.body)

  for (const [, width, height, legendCount, rowBars, boost, rowBarHeight] of sizes) {
    for (const theme of ['dark', 'light']) {
      const params = new URLSearchParams({
        w: width * 3, h: height * 3, legendCount, rowBars, boost, rowBarHeight, theme,
      })
      const png = await call(chart, '/api/chart?' + params)
      assert.equal(png.statusCode, 200)
      assert.equal(png.body.toString('hex', 0, 8), '89504e470d0a1a0a')
      assert.equal(png.body.readUInt32BE(16), width * 3)
      assert.equal(png.body.readUInt32BE(20), height * 3)
    }
  }
})

test('private authentication cannot silently fall back to a different GitHub account', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    assert.equal(new URL(input).pathname, '/user')
    return Response.json({ login: 'other' })
  })
  await assert.rejects(fetchAccountLanguageTotals(owner, { privateToken: githubPrivateToken }), /Unexpected GitHub account/)
})

test('Scriptable routes all families and only uses private data on lock screen after opt-in', async () => {
  const script = await readFile(new URL('../scriptable/widget-body.js', import.meta.url), 'utf8')
  async function render(family, lockOptIn) {
    const requests = []
    let widget
    const context = {
      Request: class {
        constructor(url) { this.url = new URL(url); requests.push(this) }
        response = { statusCode: 200 }
        async loadJSON() { return { totals: { JavaScript: 1 }, top: { name: 'Python', percent: 67 } } }
        async loadImage() { return 'fixture-png' }
      },
      Keychain: { contains: () => true, get: () => accessKey },
      ListWidget: class {
        labels = []
        addText(text) { this.labels.push(text); return {} }
        addSpacer() {}
      },
      args: { widgetParameter: '白' },
      config: { widgetFamily: family, runsInWidget: true },
      Device: { screenScale: () => 3 },
      Font: { systemFont: () => ({}), boldSystemFont: () => ({}) },
      Script: { setWidget(value) { widget = value }, complete() {} },
    }
    await runInNewContext(script
      .replace('INCLUDE_PRIVATE = false', 'INCLUDE_PRIVATE = true')
      .replace('SHOW_PRIVATE_ON_LOCK_SCREEN = false', 'SHOW_PRIVATE_ON_LOCK_SCREEN = ' + lockOptIn), context)
    assert.equal(requests.length, 1)
    return { widget, request: requests[0] }
  }

  for (const [family, width, height] of sizes) {
    const { widget, request } = await render(family, false)
    assert.equal(widget.backgroundImage, 'fixture-png')
    assert.equal(request.url.pathname, '/api/private-widget')
    assert.equal(request.url.searchParams.get('theme'), 'light')
    assert.equal(Number(request.url.searchParams.get('w')), width * 3)
    assert.equal(Number(request.url.searchParams.get('h')), height * 3)
    assert.equal(request.headers.Authorization, `Bearer ${accessKey}`)
    assert.equal(request.onRedirect(), null)
  }
  for (const family of accessories) {
    const publicView = await render(family, false)
    assert.equal(publicView.request.url.pathname, '/api/data')
    assert.equal(publicView.request.headers, undefined)
    assert.equal(publicView.widget.labels.at(-1), 'JavaScript 100%')
    const privateView = await render(family, true)
    assert.equal(privateView.request.url.pathname, '/api/private-widget')
    assert.equal(privateView.request.url.searchParams.get('format'), 'top')
    assert.equal(privateView.widget.labels.at(-1), 'Python 67%')
  }
})

test('manual Scriptable previews report the failure without displaying raw errors', async () => {
  const script = (await readFile(new URL('../scriptable/widget-body.js', import.meta.url), 'utf8'))
    .replace('INCLUDE_PRIVATE = false', 'INCLUDE_PRIVATE = true')
  const cases = [
    [false, undefined, undefined, /キーが未登録/],
    [true, 401, 'text/html', /ログイン保護/],
    [true, 401, 'application/json', /キーが拒否/],
    [true, 503, 'application/json', /設定が不足/],
    [true, 502, 'application/json', /GitHub の集計に失敗/],
    [true, undefined, undefined, /応答を取得できません/],
  ]
  for (const [hasKey, statusCode, contentType, expected] of cases) {
    const messages = []
    await runInNewContext(script, {
      Request: class {
        response = statusCode && { statusCode, headers: { 'Content-Type': contentType } }
        async loadImage() { throw new Error('raw error that must not be displayed') }
      },
      Keychain: { contains: () => hasKey, get: () => accessKey },
      Alert: class {
        addAction() {}
        addCancelAction() {}
        async presentAlert() { if (this.message) messages.push(this.message); return 0 }
      },
      args: {},
      config: { runsInWidget: false },
      Device: { screenScale: () => 3 },
      Script: { complete() {} },
    })
    assert.equal(messages.length, 1)
    assert.match(messages[0], expected)
  }
})

test('uses GitHub Linguist colors and shows two decimal places in the large iPhone chart', () => {
  const stats = buildLanguageStats({ TypeScript: 9993, Dockerfile: 4, PowerShell: 3 })
  assert.equal(stats.find(({ name }) => name === 'Dockerfile').color, '#384d54')
  assert.equal(stats.find(({ name }) => name === 'PowerShell').color, '#012456')
  assert.equal(buildLanguageStats({ Unknown: 1 })[0].color, FALLBACK_COLOR)

  for (const [family, width, height, legendCount, rowBars, boost, rowBarHeight] of sizes) {
    const tree = buildChartTree({
      owner, stats, width: width * 3, height: height * 3, legendCount,
      rowBars: Boolean(rowBars), boost, rowBarHeight, theme: THEMES.dark,
    })
    const legend = tree.props.children.at(-1)
    const labels = legend.props.children.map((row) => row.props.children.at(-1).props.children)
    const expected = family === 'large' ? ['99.93%', '0.04%', '0.03%'] : ['99.9%', '0.0%', '0.0%']
    assert.deepEqual(labels, expected, family)
  }
})

test('keeps separators between language segments and uses the Linguist group color when available', () => {
  const stats = buildLanguageStats({ 'Lean 4': 93, 'Maven POM': 6, 'SSH Config': 1 })
  assert.deepEqual(stats.map(({ color }) => color), ['#3d6ac9', '#0060ac', '#d1dbe0'])

  const options = {
    owner, width: 600, height: 600, legendCount: 0, theme: THEMES.dark,
    rowBars: false, boost: 1, rowBarHeight: 1,
  }
  const bar = (entries) => buildChartTree({ ...options, stats: entries }).props.children[1]
  const segments = bar(stats)
  assert.equal(segments.props.style.columnGap, 2)
  assert.equal(segments.props.children.length, 3)
  assert.equal(bar(stats.slice(0, 1)).props.style.columnGap, 0)
  assert.equal(bar(Array.from({ length: 100 }, (_, i) => ({ name: String(i), percent: 1 })))
    .props.style.columnGap, 0)
})
