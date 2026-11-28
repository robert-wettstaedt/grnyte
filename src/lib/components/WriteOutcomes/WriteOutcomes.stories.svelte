<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { fn } from 'storybook/test'
  import WriteOutcomes from './WriteOutcomes.svelte'

  const notFound = JSON.stringify({ message: 'routes_notFound' })
  const failed = JSON.stringify({ message: 'error_server_title' })

  const { Story } = defineMeta({
    args: { ondismiss: fn(), refusals: [] },
    component: WriteOutcomes,
    parameters: { layout: 'fullscreen' },
    tags: ['autodocs'],
    title: 'Components/WriteOutcomes',
  })
</script>

<!-- The route went while the climber was offline: nothing to reopen, only dismiss. -->
<Story name="Route gone" args={{ refusals: [{ args: '{}', id: 'w1', message: notFound, name: 'ascents.create' }] }} />

<!-- The server failed on it three times: its route is still here, so the form reopens with the values. -->
<Story
  name="Can reopen"
  args={{
    refusals: [{ args: '{}', href: '/routes/5/ascents/add', id: 'w2', message: failed, name: 'ascents.create' }],
  }}
/>

<!-- Two at once stack in the order they were refused. -->
<Story
  name="Two"
  args={{
    refusals: [
      { args: '{}', id: 'w1', message: notFound, name: 'ascents.create' },
      { args: '{}', href: '/routes/5/ascents/add', id: 'w2', message: failed, name: 'ascents.create' },
    ],
  }}
/>
