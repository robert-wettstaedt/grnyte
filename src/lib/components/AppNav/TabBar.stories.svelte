<script module lang="ts">
  import { provideGlobalState, staticGlobalState } from '$lib/state/global.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import TabBar from './TabBar.svelte'

  /**
   * Which tab is lit is read from `page.route.id`, never from a prop, so a story states a route
   * instead of an arg. `isNavItemActive` matches on a substring of the id, so these have to be the
   * ids SvelteKit really reports, route groups and all.
   */
  const onRoute = (id: string) => ({ sveltekit_experimental: { state: { page: { route: { id } } } } })

  const EXPLORE = '/(app)/(shell)/(explore)/(map)/explore'
  const FEED = '/(app)/(shell)/feed'
  const PROFILE = '/(app)/(shell)/profile'

  /**
   * The preview's GlobalState decorator hands every story `unreadNotifications: 0`, and that count
   * is the only global the bar reads, so the feed dot could never appear. The instance script below
   * republishes the same static state one level down with this holder wired in; a story moves it in
   * `beforeEach`, which Storybook runs (project, then meta, then story) before the render. The meta
   * hook resets it, so no story leaks its count into the next one.
   */
  const inbox = { unread: 0 }

  /** Placeholder rows for the one story that needs something behind the glass to blur. */
  const CONTENT_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

  const { Story } = defineMeta({
    beforeEach: () => {
      inbox.unread = 0
    },
    component: TabBar,
    // The bar is `md:hidden`: on a canvas wider than 48rem it renders nothing at all. Pinning a
    // phone viewport keeps every story the mobile bar it is meant to be, whatever width the panel
    // happens to have.
    globals: { viewport: { value: '390-844' } },
    // Fixed to the bottom edge, inset-x-0, so it gets the canvas with no padding around it.
    //
    // No `autodocs` on purpose, unlike the other primitives. A docs page forces the canvas back to
    // responsive (past 48rem the bar is display:none, so the page would be blank) and `fixed`
    // escapes each story block, stacking all five bars on the same iframe edge.
    parameters: { layout: 'fullscreen' },
    title: 'Components/AppNav/TabBar',
  })
</script>

<script lang="ts">
  provideGlobalState({
    ...staticGlobalState(),
    get unreadNotifications() {
      return inbox.unread
    },
  })
</script>

<!-- The app's landing tab. One trigger in the active treatment (primary tint plus primary text),
     two at rest, which is the pairing every regression here has to be read against. -->
<Story name="Explore" parameters={onRoute(EXPLORE)} />

<!-- Feed active. The middle cell, so the active pill is boxed in on both sides: the place where a
     padding or line-height change shows up as the grid drifting out of even thirds. -->
<Story name="Feed" parameters={onRoute(FEED)} />

<!-- Profile active, the widest label of the three and the last cell, so it is where a type-scale
     remap would first push text past its column. -->
<Story name="Profile" parameters={onRoute(PROFILE)} />

<!-- Unread inbox while the reader is somewhere else: a dot on the feed icon, never a number. The
     bar passes 0 for the tab you are standing on, so this needs a tab other than feed to show at
     all. Compare against "Feed", where the same count deliberately renders nothing. -->
<Story
  name="Unread on feed"
  beforeEach={() => {
    inbox.unread = 3
  }}
  parameters={onRoute(EXPLORE)}
/>

<!-- The bar as it actually sits in the shell: `preset-glass-neutral` over scrolled content, which
     is the only way its tint, inset shadow and 16px blur are visible at all. The preset is mixed
     from `--color-surface-50-950`, so a theme token move lands here first. -->
<Story name="Over content" parameters={onRoute(EXPLORE)}>
  {#snippet template()}
    <div class="flex min-h-screen flex-col gap-3 p-4">
      {#each CONTENT_ROWS as row (row)}
        <div class="bg-surface-200-800 h-24 rounded-2xl"></div>
      {/each}
    </div>

    <TabBar />
  {/snippet}
</Story>
