<script module lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import StatusBar from './StatusBar.svelte'

  const { Story } = defineMeta({
    component: StatusBar,
    parameters: { layout: 'fullwidth' },
    tags: ['autodocs'],
    title: 'Components/StatusBar',
  })
</script>

{#snippet template(args: ComponentProps<typeof StatusBar>)}
  <StatusBar {...args} />
{/snippet}

<!-- Device offline: suppresses both sync branches, writes would fail. -->
<Story name="Offline" args={{ connectionState: { name: 'connected' }, online: false }} {template} />

<!-- Zero flapping: reads are stale, writes still land. Shown after a 10s hold. -->
<Story name="Reconnecting" args={{ connectionState: { name: 'connecting' }, online: true }} {template} />

<!-- Terminal: only a fresh client recovers, so the bar offers a reload. -->
<Story name="Not syncing" args={{ connectionState: { name: 'needs-auth' }, online: true }} {template} />

<!-- Announcement, the only dismissible variant. Dismissing really does persist, under a
     story-only id so it cannot hide the shipped notice: clear `grnyte.dismissedAnnouncements`
     from localStorage to bring this story back. -->
<Story
  name="Announcement"
  args={{
    announcement: { endsAt: '2099-01-01', id: 'storybook', message: m.status_announcementV2 },
    connectionState: { name: 'connected' },
    online: true,
  }}
  {template}
/>
