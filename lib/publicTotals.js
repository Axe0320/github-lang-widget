import { fetchAccountLanguageTotals } from './githubData.js'

const TTL = 30 * 60 * 1000
const MAX_ENTRIES = 50
const cache = new Map()

export function getPublicTotals(owner) {
  const key = owner.toLowerCase()
  const existing = cache.get(key)
  if (existing && existing.expires > Date.now()) return existing.promise
  cache.delete(key)
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value)

  const entry = {
    expires: Date.now() + TTL,
    promise: fetchAccountLanguageTotals(owner).catch((error) => {
      if (cache.get(key) === entry) cache.delete(key)
      throw error
    }),
  }
  cache.set(key, entry)
  return entry.promise
}
