/**
 * Types for the one Kit internal `testHarness.ts` needs.
 *
 * `@sveltejs/kit/internal/server` maps its `types` condition to `./types/index.d.ts`, an ambient
 * declaration file rather than a module, so importing from it is a TS2306 ("is not a module") even
 * though the runtime export is real. Declaring the shape here keeps `npm run check` green without
 * suppressing the error at the import site, and it documents the surface we depend on: if a Kit
 * upgrade moves `with_request_store`, this file and `testHarness.ts` are the two places to look.
 */
declare module '@sveltejs/kit/internal/server' {
  /** Runs `fn` with `store` installed as the current request store (AsyncLocalStorage-backed). */
  export function with_request_store<T>(store: unknown, fn: () => T): T
}
