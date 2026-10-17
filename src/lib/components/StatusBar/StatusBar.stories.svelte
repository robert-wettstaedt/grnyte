<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import StatusBar from './StatusBar.svelte'

  const { Story } = defineMeta({
    // The bar spans the app frame, so it gets the whole canvas with no padding around it.
    // `holdMs: 0` skips the flap guard: the live bar waits 10s (3s for a terminal state)
    // before it says anything, and a story that pins a state has already done that waiting.
    args: { holdMs: 0 },
    component: StatusBar,
    parameters: { layout: 'fullscreen' },
    tags: ['autodocs'],
    title: 'Components/StatusBar',
  })
</script>

<!-- Device offline: suppresses both sync branches, writes would fail. -->
<Story name="Offline" args={{ connectionState: { name: 'connected' }, online: false }} />

<!-- Zero flapping: reads are stale, writes still land. -->
<Story name="Reconnecting" args={{ connectionState: { name: 'connecting' }, online: true }} />

<!-- Terminal: only a fresh client recovers, so the bar offers a reload. -->
<Story name="Not syncing" args={{ connectionState: { name: 'needs-auth' }, online: true }} />

<!-- A deploy landed while this tab was open. Ranks below every branch above it, so the story has
     to pin a healthy connection to show it at all. -->
<Story name="Update ready" args={{ connectionState: { name: 'connected' }, online: true, updateReady: true }} />
