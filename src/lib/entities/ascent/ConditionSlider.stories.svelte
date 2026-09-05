<script module lang="ts">
  import { formatCelsius, formatHumidity } from '$lib/i18n/units.svelte'
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ConditionSlider from './ConditionSlider.svelte'

  // The plain-number sibling of GradeSlider, used twice by the ascent form: temperature and
  // humidity. It has no disabled state, so the states worth pinning are unset (faded track,
  // ghost mid thumb, no value, Clear reserved but invisible) and the ends of both tracks.
  // The real formatters are used rather than story-only ones, so the unit and spacing match
  // the app; note they follow the browser's region, so a US locale renders °F here.
  const temperature = {
    format: formatCelsius,
    label: m.ascents_form_temperatureLabel(),
    max: 40,
    min: -10,
  } satisfies ComponentProps<typeof ConditionSlider>

  const humidity = {
    format: formatHumidity,
    label: m.ascents_form_humidityLabel(),
    max: 100,
    min: 0,
    step: 5,
  } satisfies ComponentProps<typeof ConditionSlider>

  const { Story } = defineMeta({
    args: temperature,
    component: ConditionSlider,
    parameters: { layout: 'centered', width: 340 },
    tags: ['autodocs'],
    title: 'Entities/Ascent/ConditionSlider',
  })
</script>

<!-- How the ascent form opens: no value, faded track, dashed ghost thumb parked mid range,
     and the Clear button holding its slot invisibly so picking a value never shifts the row. -->
<Story name="Unset" />

<!-- Minimum of the temperature track: filled range collapsed to nothing at the start. -->
<Story name="Min (-10 C)" args={{ value: -10 }} />

<!-- A picked mid value: primary-filled range, solid thumb, Clear button visible. -->
<Story name="Mid (12 C)" args={{ value: 12 }} />

<!-- Maximum: the range fills the whole track. -->
<Story name="Max (40 C)" args={{ value: 40 }} />

<!-- The form's second instance: percent format, 0-100 in steps of 5, still unset. -->
<Story name="Humidity unset" args={humidity} />

<!-- Humidity with a value, the state a logged ascent restores into. -->
<Story name="Humidity mid" args={{ ...humidity, value: 45 }} />

<!-- Humidity at the top of its track. -->
<Story name="Humidity max" args={{ ...humidity, value: 100 }} />

<!-- A long label next to a wide value: the header row is a flex with a spacer, so it should
     stay on one line with the value and Clear pinned to the end. -->
<Story name="Long label" args={{ ...humidity, label: 'Relative humidity at the block', value: 85 }} />
