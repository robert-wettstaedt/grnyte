<script module lang="ts">
  import { GRADES as grades } from '$storybook/grades'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import GradeSlider from './GradeSlider.svelte'

  // The one-thumb sibling of the map filter's GradeRange (see
  // routes/(app)/(shell)/(explore)/(map)/Filter/fields/GradeRange.stories.svelte). It has no
  // disabled state, so the states worth pinning are: unset (ghost thumb over the faded heat
  // gradient), and one picked grade per difficulty band, since the band drives the track fill,
  // the thumb colour and the chip. Ids come from the seeded 25-grade table, 0 = FB 3 … 24 = 9A+.
  const { Story } = defineMeta({
    args: { grades, gradingScale: 'FB' },
    component: GradeSlider,
    parameters: { layout: 'centered', width: 340 },
    tags: ['autodocs'],
    title: 'Entities/Grade/GradeSlider',
  })
</script>

<!-- No grade picked: dashed "?" chip, hint copy, faded heat-gradient track, ghost mid thumb.
     This is how the route and ascent forms open. -->
<Story name="Unset" />

<!-- Minimum: the very-easy band, thumb hard against the start of the track. -->
<Story name="Min (FB 3)" args={{ value: 0 }} />

<!-- Easy band, and the picked state in general: solid chip, Clear button, coloured range. -->
<Story name="Easy band (6B+)" args={{ value: 8 }} />

<!-- Roughly mid track, medium band. -->
<Story name="Mid (7B+)" args={{ value: 14 }} />

<!-- Maximum: the hard band, thumb hard against the end of the track. -->
<Story name="Max (9A+)" args={{ value: 24 }} />

<!-- Same slider on the V scale: chip and tick labels change, colours do not (bands are
     absolute by grade id). -->
<Story name="V scale" args={{ gradingScale: 'V', value: 11 }} />
