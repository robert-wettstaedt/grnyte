import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { storage } from './storage'

const KEY = `${PUBLIC_APPLICATION_NAME}:searchHistory`
const CAP = 8

/** Prepend `query` (deduped case-insensitively, trimmed) and cap the list. */
export function addToHistory(items: string[], query: string, cap = CAP): string[] {
  const q = query.trim()
  if (q === '') {
    return items
  }
  return [q, ...items.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, cap)
}

export function clearHistory(): void {
  storage.remove(KEY)
}

export function loadHistory(): string[] {
  try {
    const raw: unknown = JSON.parse(storage.get(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string').slice(0, CAP) : []
  } catch {
    return []
  }
}

export function removeFromHistory(items: string[], query: string): string[] {
  return items.filter((item) => item !== query)
}

/** A refused write is fine: history is a convenience. */
export function saveHistory(items: string[]): void {
  storage.set(KEY, JSON.stringify(items))
}
