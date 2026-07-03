<script lang="ts">
  import type { Snippet } from 'svelte'
  import { provideGlobalState } from '../src/lib/state/global.svelte'
  import type { QueryResource } from '../src/lib/zero/resource.svelte'

  const { children }: { children: Snippet } = $props()

  /** Static, already-"ready" stand-in for a Zero-backed resource. */
  function ready<T>(data: T): QueryResource<T> {
    return {
      data,
      status: 'ready',
      isEmpty: Array.isArray(data) ? data.length === 0 : data == null,
      isSyncing: false,
      isComplete: true,
    }
  }

  // The empty-but-ready global state components read via getGlobalState().
  // Components needing richer data (grades, user) should grow story-level
  // fixtures here when the need arises. Zero itself stays unmocked, so stories
  // must not exercise paths that run queries (e.g. `!type:id!` references).
  provideGlobalState({
    grades: [],
    tags: [],
    user: undefined,
    gradingScale: 'FB',
    userRole: undefined,
    userPermissions: undefined,
    userRegions: [],
    isLoading: false,
    gradesResource: ready([]),
    tagsResource: ready([]),
    userResource: ready(undefined),
    userRoleResource: ready(undefined),
    rolePermissionsResource: ready([]),
    userRegionsResource: ready([]),
  })
</script>

{@render children()}
