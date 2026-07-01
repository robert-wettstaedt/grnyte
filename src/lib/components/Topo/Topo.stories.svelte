<script module lang="ts">
  import type { GradeBand } from '$lib/entities/grade/color'
  import { convertPathToPoints } from '$lib/entities/topo/mapper'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import Topo from './Topo.svelte'

  const { Story } = defineMeta({
    title: 'Components/Topo',
    component: Topo,
    tags: ['autodocs'],
    parameters: { layout: 'centered' },
    args: { imagePath: 'topo-sample.svg', alt: 'Sample topo' },
  })

  // Lines in the 800×1000 pixel space of the placeholder image (.storybook/fixtures).
  // A trailing `Z` marks the last point as the top-out.
  const line = (id: number, path: string, band: GradeBand | undefined, topType: 'top' | 'topout') => ({
    id,
    band,
    topType,
    points: convertPathToPoints(path),
  })

  // A spread that exercises the renderer in one canvas: all four grade bands (colour),
  // a top vs top-out marker, a two-hand start, and an ungraded line (band undefined → grey).
  const slab = line(1, 'M150,910 L162,560 L152,210 Z', 1, 'top')
  const overhang = line(2, 'M300,915 L285,770 L330,650 L290,520 L335,380 L315,210 Z', 4, 'topout')
  const arete = line(3, 'M450,905 L478,640 L450,360 Z', 3, 'top')
  const twoStarts = line(4, 'M560,905 L600,690 M640,905 L600,690 L608,360 Z', 2, 'topout')
  const ungraded = line(5, 'M740,900 L748,300 Z', undefined, 'top')

  const allRoutes = [slab, overhang, arete, twoStarts, ungraded]

  // Start-hold bracket cases, drawn side by side: one two-hand start, two routes
  // sharing BOTH holds then diverging, and two sharing ONE hold. Brackets group the
  // holds; overlapping brackets must stay legible.
  const startSets = [
    [line(1, 'M405,905 L450,735 M495,905 L450,735 L455,330 Z', 3, 'topout')],
    [
      line(1, 'M380,905 L430,720 M470,905 L430,720 L300,340 Z', 3, 'topout'),
      line(2, 'M380,905 L430,720 M470,905 L430,720 L590,340 Z', 4, 'topout'),
    ],
    [
      line(1, 'M360,905 L420,720 M470,905 L420,720 L380,340 Z', 2, 'top'),
      line(2, 'M470,905 L520,720 M600,905 L520,720 L560,340 Z', 4, 'topout'),
    ],
  ]
</script>

{#snippet template(args: ComponentProps<typeof Topo>)}
  <div style="width: 320px;">
    <Topo {...args} />
  </div>
{/snippet}

{#snippet startHolds()}
  <div style="display: flex; gap: 12px;">
    {#each startSets as lines (lines)}
      <div style="width: 200px;"><Topo imagePath="topo-sample.svg" alt="Sample topo" {lines} /></div>
    {/each}
  </div>
{/snippet}

<!-- Every line by grade band (one ungraded → grey), both marker types, a two-hand start.
     curved / highlightId / interactive / zoomable are all live controls on this story. -->
<Story name="All routes" args={{ lines: allRoutes }} {template} />

<!-- One line emphasised, the rest dimmed but still visible (e.g. driven by a route list). -->
<Story name="Highlighted" args={{ lines: allRoutes, highlightId: 2 }} {template} />

<!-- Tap / click a line to focus it; tap again to clear. -->
<Story name="Interactive (tap to focus)" args={{ lines: allRoutes, interactive: true }} {template} />

<!-- Pinch, wheel or double-tap to zoom, drag to pan, to inspect holds. -->
<Story name="Zoomable" args={{ lines: allRoutes, zoomable: true }} {template} />

<!-- Start-hold brackets across three sharing patterns. -->
<Story name="Start holds" template={startHolds} />

<!-- Route mode: a single line. -->
<Story name="Single route" args={{ lines: [overhang] }} {template} />
