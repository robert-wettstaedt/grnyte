<script module lang="ts">
  import { convertPathToPoints } from '$lib/entities/topo/mapper'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import RouteRow from './RouteRow.svelte'

  // The route DTO carries name, gradeFk (→ heat band), rating (stars), the
  // description (markdown subline) and topo thumbnail; the display grade label
  // stays a separate prop. Keep story descriptions free of `!type:id!`
  // references: those resolve through Zero, which Storybook doesn't run (the
  // preview decorator only provides the global-state context).
  const base = {
    crumbs: 'Roadside · The Arch',
    grade: '7a+',
    route: { description: 'Sit start on crimps', gradeFk: 12, name: 'Arch Nemesis', rating: 3, tags: [] },
    status: 'redpoint',
  } satisfies ComponentProps<typeof RouteRow>

  const { Story } = defineMeta({
    args: base,
    argTypes: {
      status: {
        control: 'select',
        description: "The user's logged ascent state, if any.",
        options: [undefined, 'flash', 'redpoint', 'attempt', 'repeat'],
      },
    },
    component: RouteRow,
    parameters: {
      layout: 'centered',
      width: 360,
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/RouteRow',
  })
</script>

<Story name="Default" />

<Story name="Flashed" args={{ status: 'flash' }} />

<Story name="Project" args={{ status: 'attempt' }} />

<Story name="Repeat" args={{ status: 'repeat' }} />

<Story name="No ascent" args={{ route: { ...base.route, rating: 0 }, status: undefined }} />

<Story name="As link" args={{ href: '#' }} />

<!-- Selected card: expands with the tags/actions line. -->
<Story
  name="Active (expanded)"
  args={{
    active: true,
    detailsHref: '#',
    mapHref: '#',
    route: { ...base.route, tags: ['SD', 'high'] },
  }}
/>

<!-- Real topo thumbnail with the route's line, in the normalized 0–1 format (legacy
     pixel paths are skipped in the tile: their original photo size isn't known). -->
<Story
  name="With topo"
  args={{
    route: {
      ...base.route,
      topoImagePath: 'topo-sample.svg',
      topoPoints: convertPathToPoints(
        'M0.375,0.915 L0.35625,0.77 L0.4125,0.65 L0.3625,0.52 L0.41875,0.38 L0.39375,0.21 Z',
      ),
    },
  }}
/>
