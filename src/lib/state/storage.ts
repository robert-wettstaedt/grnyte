/** `localStorage`, guarded: a browser that blocks storage throws on plain access, which blanks the page. */
export const storage = {
  get(key: string): null | string {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Blocked storage: the value is simply not remembered.
    }
  },
}
