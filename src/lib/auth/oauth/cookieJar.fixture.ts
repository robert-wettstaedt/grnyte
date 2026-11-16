/** A browser's cookies for one origin, behind Kit's `Cookies` API: what was set, and what the next request sends. */
import type { Cookies } from '@sveltejs/kit'

type Options = Parameters<Cookies['set']>[2]

export function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const written: { name: string; options: Options; value: string }[] = []

  const cookies = {
    delete: (name: string, options: Options) => {
      written.push({ name, options: { ...options, maxAge: 0 }, value: '' })
      values.delete(name)
    },
    get: (name: string) => values.get(name),
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    serialize: () => '',
    set: (name: string, value: string, options: Options) => {
      written.push({ name, options, value })
      if (options.maxAge === 0) values.delete(name)
      else values.set(name, value)
    },
  } as unknown as Cookies

  return { cookies, values, written }
}
