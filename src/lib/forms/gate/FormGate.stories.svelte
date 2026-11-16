<script module lang="ts">
  import type { QueryPhase } from '$lib/zero/resource.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import FormGate from './FormGate.svelte'
  import type { FormWait } from './gate'

  const row = (phase: QueryPhase, whole = false, notFound = 'Route not found'): FormWait => ({
    notFound,
    resource: { data: phase.kind === 'loading' || phase.kind === 'error' ? undefined : { id: 1 }, phase },
    whole,
  })

  const answered: QueryPhase = { empty: false, kind: 'answered' }

  const { Story } = defineMeta({
    args: {
      action: { label: 'Save' },
      cancelTo: '/routes/1',
      title: 'Edit route',
      waitFor: [row({ kind: 'loading' })],
    },
    component: FormGate,
    parameters: { layout: 'fullscreen' },
    tags: ['autodocs'],
    title: 'Forms/FormGate',
  })
</script>

<!-- A definite height, as the app's scroll container gives it, so a filling body has one too. -->
{#snippet template(args: Omit<ComponentProps<typeof FormGate>, 'children'>)}
  <div style="height: 100dvh">
    <FormGate {...args}>
      {#snippet children(rows)}
        <p class="p-4">Fields over {rows.length} rows</p>
      {/snippet}
    </FormGate>
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

<Story
  name="Second row loading"
  {template}
  args={{ waitFor: [row(answered), row({ kind: 'loading' }, false, 'Block not found')] }}
/>

<Story name="Whole, related rows arriving" {template} args={{ waitFor: [row({ kind: 'arriving' }, true)] }} />

<Story name="Whole, offline before related rows" {template} args={{ waitFor: [row({ kind: 'partial' }, true)] }} />

<Story
  name="Open"
  {template}
  args={{ waitFor: [row({ kind: 'arriving' }), row(answered, false, 'Block not found')] }}
/>

<Story name="Not found" {template} args={{ waitFor: [row({ empty: true, kind: 'answered' })] }} />

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
    waitFor: [row(answered)],
  }}
/>

<Story name="Offline, not downloaded" {template} args={{ waitFor: [row({ excluded: false, kind: 'unavailable' })] }} />

<Story name="Error" {template} args={{ waitFor: [row({ kind: 'error' })] }} />
