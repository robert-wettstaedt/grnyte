<script module lang="ts">
  import type { GradeBand } from '$lib/entities/grade/color'
  import { convertPathToPoints } from '$lib/entities/topo/mapper'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import Topo from './Topo.svelte'

  const { Story } = defineMeta({
    args: { alt: 'Sample topo', imagePath: 'topo-sample.svg' },
    component: Topo,
    parameters: { layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/Topo',
  })

  // Lines in the 800×1000 pixel space of the placeholder image (.storybook/fixtures).
  // A trailing `Z` marks the last point as the top-out.
  const line = (id: number, path: string, band: GradeBand | undefined, topType: 'top' | 'topout', number?: number) => ({
    band,
    id,
    number,
    points: convertPathToPoints(path),
    topType,
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

  // A photo need not show both ends of a line: the boulder can be taller than one frame, or the
  // sit start can be in a cave. A path then stores no `M` (no start hold) or no `Z` (no top), and
  // the renderer must draw neither a start ring nor a topout arrow for the end that is missing.
  // Numbered so the badge is visible: it hangs under the start holds, or under the foot of the
  // line when there are none.
  const partial = [
    line(1, 'M720,900 L760,620 L740,280 Z', 1, 'topout', 1),
    line(2, 'L180,880 L220,600 L200,260 Z', 2, 'topout', 2),
    line(3, 'M380,900 L420,640 L400,300', 3, 'topout', 3),
    line(4, 'L560,880 L600,620 L580,280', 4, 'topout', 4),
  ]

  // Real rows store a point twice: topo_route 2163 repeats its top three times, 1827 its middle.
  // A zero-length segment gives the spline a direction of nothing, so it kinks or bulges past its
  // own end. 1 and 2 are the same line with and without a doubled waypoint and must draw
  // identically; 3 repeats its top three times; 4 returns to an earlier hold, which is a real move
  // and must still show as one.
  const repeats = [
    line(1, 'M150,910 L180,600 L160,240 Z', 1, 'topout', 1),
    line(2, 'M330,910 L360,600 L360,600 L340,240 Z', 2, 'topout', 2),
    line(3, 'M510,910 L540,600 L520,240 L520,240 L520,240 Z', 3, 'topout', 3),
    line(4, 'M680,910 L710,700 L730,520 L710,700 L700,240 Z', 4, 'topout', 4),
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
<Story name="Highlighted" args={{ highlightId: 2, lines: allRoutes }} {template} />

<!-- Tap / click a line to focus it; tap again to clear. -->
<Story name="Interactive (tap to focus)" args={{ interactive: true, lines: allRoutes }} {template} />

<!-- Pinch, wheel or double-tap to zoom, drag to pan, to inspect holds. -->
<Story name="Zoomable" args={{ lines: allRoutes, zoomable: true }} {template} />

<!-- Start-hold brackets across three sharing patterns. -->
<Story name="Start holds" template={startHolds} />

<!-- Route mode: a single line. -->
<Story name="Single route" args={{ lines: [overhang] }} {template} />

<!-- Both ends optional. 1 shows start and top, 2 has no start hold, 3 has no top, 4 has neither.
     Only 1 and 2 may draw a topout arrow; only 1 and 3 may draw a start ring. -->
<Story name="Partial photo (no start or top)" args={{ lines: partial }} {template} />

<!-- A point stored twice must not steer the line twice. 1 and 2 are the same line, 2 with a
     doubled waypoint: they must be indistinguishable. 3 repeats its top three times, so the curve
     must end ON the arrow, not bulge past it. 4 revisits an earlier hold, which is a real move. -->
<Story name="Repeated points" args={{ lines: repeats }} {template} />
