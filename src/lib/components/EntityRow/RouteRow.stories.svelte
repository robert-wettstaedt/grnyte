<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import RouteRow from './RouteRow.svelte'

  const { Story } = defineMeta({
    title: 'Components/EntityRow/RouteRow',
    component: RouteRow,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
    argTypes: {
      band: {
        control: { type: 'range', min: 1, max: 7, step: 1 },
        description: 'Heat-scale band that colours the grade (1 = easy → 7 = hard).',
      },
      stars: {
        control: { type: 'range', min: 0, max: 3, step: 1 },
        description: 'Quality rating, 0–3 stars.',
      },
      status: {
        control: 'select',
        options: [undefined, 'flash', 'redpoint', 'attempt', 'repeat'],
        description: 'Logged ascent state, if any.',
      },
    },
  })

  const base = {
    name: 'Arch Nemesis',
    crumbs: 'Roadside · The Arch',
    grade: '7a+',
    band: 4,
    stars: 3,
    status: 'redpoint',
    subline: 'Sit start on crimps',
  } satisfies ComponentProps<typeof RouteRow>
</script>

{#snippet template(args: ComponentProps<typeof RouteRow>)}
  <div style="width: 360px;">
    <RouteRow {...args} />
  </div>
{/snippet}

<Story name="Default" args={{ ...base }} {template} />

<Story name="Flashed" args={{ ...base, status: 'flash' }} {template} />

<Story name="Project" args={{ ...base, status: 'attempt' }} {template} />

<Story name="No ascent" args={{ ...base, status: undefined, stars: 0 }} {template} />

<Story name="As link" args={{ ...base, href: '#' }} {template} />

<Story name="Picker option" args={{ ...base, option: true }} {template} />

<Story name="Picker option (active)" args={{ ...base, option: true, active: true }} {template} />
