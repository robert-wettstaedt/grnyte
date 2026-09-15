<script module lang="ts">
  import { provideGlobalState, staticGlobalState } from '$lib/state/global.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import NavRail from './NavRail.svelte'

  /**
   * Which trigger is lit is read from `page.route.id`, never from a prop, so a story states a route
   * instead of an arg. `isNavItemActive` matches on a substring of the id, so these have to be the
   * ids SvelteKit really reports, route groups and all.
   */
  const onRoute = (id: string) => ({ sveltekit_experimental: { state: { page: { route: { id } } } } })

  const EXPLORE = '/(app)/(shell)/(explore)/(map)/explore'
  const FEED = '/(app)/(shell)/feed'
  const PROFILE = '/(app)/(shell)/profile'

  /**
   * The preview's GlobalState decorator hands every story `unreadNotifications: 0`, and that count
   * is the only global the rail reads, so the feed dot could never appear. The instance script below
   * republishes the same static state one level down with this holder wired in; a story moves it in
   * `beforeEach`, which Storybook runs (project, then meta, then story) before the render. The meta
   * hook resets it, so no story leaks its count into the next one.
   */
  const inbox = { unread: 0 }

  /** Placeholder tiles for the one story that needs something behind the glass to blur. */
  const CONTENT_TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

  const { Story } = defineMeta({
    beforeEach: () => {
      inbox.unread = 0
    },
    component: NavRail,
    // The rail is `hidden md:flex`: under 48rem it renders nothing at all. Pinning a desktop
    // viewport keeps every story the rail it is meant to be, whatever width the panel happens to
    // have, and gives `h-full` a fixed height to measure the trigger column against.
    globals: { viewport: { value: '1280-800' } },
    // Fixed to the left edge, full height, 5rem wide, so it gets the canvas with no padding around
    // it.
    //
    // No `autodocs` on purpose, unlike the other primitives. A docs page forces the canvas back to
    // responsive and `fixed` escapes each story block, so all five rails would stack on the same
    // iframe edge instead of appearing one per block.
    parameters: { layout: 'fullscreen' },
    title: 'Components/AppNav/NavRail',
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

<!-- The app's landing tab. Logo header above one trigger in the active treatment (primary tint plus
     primary text) and two at rest, which is the pairing every regression here has to be read
     against. Each trigger is a fixed `size-13` box, so a padding or line-height change shows up as
     the icon and its label crowding inside a square that does not move. -->
<Story name="Explore" parameters={onRoute(EXPLORE)} />

<!-- Feed active: the middle trigger, boxed in above and below by two at rest. -->
<Story name="Feed" parameters={onRoute(FEED)} />

<!-- Profile active. The widest label of the three in the narrowest chrome the app has, so it is
     where a type-scale remap would first push text past the 5rem rail. -->
<Story name="Profile" parameters={onRoute(PROFILE)} />

<!-- Unread inbox while the reader is somewhere else: a dot on the feed icon, never a number. The
     rail passes 0 for the tab you are standing on, so this needs a trigger other than feed to show
     at all. Compare against "Feed", where the same count deliberately renders nothing. -->
<Story
  name="Unread on feed"
  beforeEach={() => {
    inbox.unread = 3
  }}
  parameters={onRoute(EXPLORE)}
/>

<!-- The rail as it actually sits in the shell. It is `fixed`, so it takes no space and the map runs
     full bleed beneath it: `preset-glass-neutral` over content is the only way its tint, inset
     shadow and 16px blur are visible at all. The preset is mixed from `--color-surface-50-950`, so
     a theme token move lands here first. -->
<Story name="Over content" parameters={onRoute(EXPLORE)}>
  {#snippet template()}
    <div class="grid min-h-screen grid-cols-4 gap-3 p-3">
      {#each CONTENT_TILES as tile (tile)}
        <div class="bg-surface-200-800 h-40 rounded-2xl"></div>
      {/each}
    </div>

    <NavRail />
  {/snippet}
</Story>
