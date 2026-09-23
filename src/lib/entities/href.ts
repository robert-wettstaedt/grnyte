/**
 * The detail screen of one entity, and the only place those six route patterns are written.
 *
 * Use this wherever a URL is a VALUE: a handler's `redirectTo`, a form's `cancelTo`, a `back()` or
 * `exit()` argument, an href passed as a prop. An `href` the lint rule can verify keeps its literal
 * `resolve()` instead: `svelte/no-navigation-without-resolve` is syntactic, so it sees a direct call
 * on an `<a href>` or a variable traced to one, and nothing else.
 */
import { resolve } from '$app/paths'

/** Every entity with a detail screen. `EntityType` (the searchable ones) is a subset of this. */
export type EntityKind = 'areas' | 'ascents' | 'blocks' | 'regions' | 'routes' | 'users'

// The return type is inferred, not `string`: `resolve()` returns Kit's resolved-pathname union, and
// props typed against it (an ErrorState action, a SiblingNav entry) refuse a plain string.
export function entityHref(kind: EntityKind, id: number) {
  // No `default`: a new kind has to answer here or it will not compile.
  switch (kind) {
    case 'areas':
      return resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(id) })
    case 'ascents':
      return resolve('/(app)/ascents/[id]', { id: String(id) })
    case 'blocks':
      return resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(id) })
    case 'regions':
      return resolve('/(app)/regions/[regionId]', { regionId: String(id) })
    case 'routes':
      return resolve('/(app)/routes/[id]', { id: String(id) })
    case 'users':
      return resolve('/(app)/users/[id]', { id: String(id) })
  }
}
