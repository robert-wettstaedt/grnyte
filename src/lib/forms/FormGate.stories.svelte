<script module lang="ts">
  import type { QueryResource } from '$lib/zero/resource.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import FormGate from './FormGate.svelte'
  import type { FormWait } from './gate'

  const row: QueryResource<unknown> = {
    availability: 'ready',
    data: { id: 1 },
    isComplete: true,
    isEmpty: false,
    isSyncing: false,
    settled: true,
    status: 'ready',
  }
  const waitOn = (resource: Partial<QueryResource<unknown>>): FormWait[] => [
    { notFound: 'Route not found', resource: { ...row, ...resource } },
  ]

  const { Story } = defineMeta({
    args: {
      action: { label: 'Save' },
      cancelTo: '/routes/1',
      children: undefined,
      title: 'Edit route',
      waitFor: waitOn({ status: 'loading' }),
    },
    component: FormGate,
    parameters: { layout: 'fullscreen' },
    tags: ['autodocs'],
    title: 'Forms/FormGate',
  })
</script>

<!-- A definite height, as the app's scroll container gives it, so a filling body has one too. -->
{#snippet template(args: ComponentProps<typeof FormGate>)}
  <div style="height: 100dvh">
    <FormGate {...args} />
  </div>
{/snippet}

<!-- The skeleton holds for 250 ms before it shows, so a fast load shows only the header. -->
<Story name="Loading" {template} />

<Story name="Loading, map" {template} args={{ fill: true, title: 'Move block' }} />

<Story
  name="Loading, wizard"
  {template}
  args={{
    action: { icon: 'arrow-right', iconAfter: true, label: 'Next' },
    fill: true,
    steps: ['Parking', 'Path'],
    title: 'Add parking',
  }}
/>

<Story name="Not found" {template} args={{ waitFor: waitOn({ data: undefined, isEmpty: true }) }} />

<Story
  name="No permission"
  {template}
  args={{
    denied: {
      description: 'You can view this route, but editing it needs edit rights in its region.',
      primaryAction: { href: '/routes/1', label: 'View route' },
      title: 'No permission',
      type: 'generic',
    },
    waitFor: waitOn({}),
  }}
/>

<Story
  name="Offline, not downloaded"
  {template}
  args={{ waitFor: waitOn({ availability: 'unsynced', settled: false, status: 'loading' }) }}
/>

<Story name="Error" {template} args={{ waitFor: waitOn({ status: 'error' }) }} />
