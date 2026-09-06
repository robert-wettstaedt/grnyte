<script module lang="ts">
  import { GRADES as grades } from '$storybook/grades'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import GradePicker from './GradePicker.svelte'

  // Replaced GradeSlider. Pins unset, one grade per colour band, both ends, and the V scale where
  // `scaleRungs` collapses 25 Font grades to 21 rungs. Ids are the seeded table, 0 = FB 3 … 24 = 9A+.
  const { Story } = defineMeta({
    args: { grades, gradingScale: 'FB' },
    component: GradePicker,
    parameters: { layout: 'centered', width: 340 },
    tags: ['autodocs'],
    title: 'Entities/Grade/GradePicker',
  })
</script>

<!-- How the route and ascent forms open: dashed chip, no ±, so unset never reads as a default. -->
<Story name="Unset" />

<!-- Minimum: the very-easy band, and the − button disabled against the floor. -->
<Story name="Min (FB 3)" args={{ value: 0 }} />

<!-- The picked state in general: band-coloured chip, both ±, Clear visible. -->
<Story name="Easy band (6B+)" args={{ value: 8 }} />

<!-- Medium band, roughly mid ladder. -->
<Story name="Mid (7B+)" args={{ value: 14 }} />

<!-- Maximum: the hard band, and the + button disabled against the ceiling. -->
<Story name="Max (9A+)" args={{ value: 24 }} />

<!-- Same picker on the V scale. The chip reads V6 and the list holds 21 rungs, not 25. -->
<Story name="V scale" args={{ gradingScale: 'V', value: 11 }} />

<!-- 6A+ is the grade V has no word for: the V3 rung adopts it, so opening the form never downgrades
     the route to 6A. -->
<Story name="V scale, adopted 6A+" args={{ gradingScale: 'V', value: 6 }} />

<!-- The narrowest the chip gets, where the select's intrinsic width would overhang the + button. -->
<Story name="Narrowest chip (FB 4)" args={{ value: 1 }} />
