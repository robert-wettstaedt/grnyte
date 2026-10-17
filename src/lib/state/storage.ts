/** `localStorage`, guarded: a browser that blocks storage throws on plain access, which blanks the page. */
export const storage = {
  get(key: string): null | string {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // Blocked storage holds nothing to remove.
    }
  },
  /** Whether the write took: blocked or full storage refuses it. */
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  },
}
