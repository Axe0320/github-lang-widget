import { fetchAccountLanguageTotals, DEFAULT_OWNER } from '../lib/githubData.js'

export const config = { runtime: 'edge' }

// Separated from api/chart.js so the GitHub fetch happens once and gets
// cached here, regardless of how many differently-sized/themed /api/chart
// requests need the same account's data. Without this, every unique chart
// query string (one per widget size) triggered its own full GitHub fetch.
export default async function handler(request) {
  const { searchParams } = new URL(request.url)
  const owner = searchParams.get('owner') || DEFAULT_OWNER

  try {
    const totals = await fetchAccountLanguageTotals(owner)
    return new Response(JSON.stringify({ totals }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
      },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || 'Failed to load account languages' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Never cache a transient failure as if it were good data.
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
