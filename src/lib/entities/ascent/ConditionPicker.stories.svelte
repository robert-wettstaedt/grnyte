<script module lang="ts">
  import { formatHumidity, temperatureField } from '$lib/i18n/units.svelte'
  import { m } from '$lib/paraglide/messages'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ConditionPicker from './ConditionPicker.svelte'

  // Replaced ConditionSlider. Both ascent-form instances are pinned here with the ends of each
  // range. Temperature takes its whole config from `temperatureField`, exactly as the form does,
  // so these stories follow the browser's unit system: a US locale renders the °F field, 14..104,
  // stepping in fives. The `value` args are always stored Celsius.
  const temperature = {
    label: m.ascents_form_temperatureLabel(),
    ...temperatureField(),
  } satisfies ComponentProps<typeof ConditionPicker>

  const humidity = {
    format: formatHumidity,
    label: m.ascents_form_humidityLabel(),
    max: 100,
    min: 0,
    step: 5,
    unit: '%',
  } satisfies ComponentProps<typeof ConditionPicker>

  const { Story } = defineMeta({
    args: temperature,
    component: ConditionPicker,
    parameters: { layout: 'centered', width: 340 },
    tags: ['autodocs'],
    title: 'Entities/Ascent/ConditionPicker',
  })
</script>

<!-- How the ascent form opens. Unlike the grade picker the ± stay: an empty number field cannot be
     mistaken for a filled one. -->
<Story name="Unset" />

<!-- Minimum of the temperature range, with − disabled against the floor. -->
<Story name="Min (-10 C)" args={{ value: -10 }} />

<!-- A picked mid value: formatted in the header, both ± live, Clear visible. -->
<Story name="Mid (12 C)" args={{ value: 12 }} />

<!-- Maximum, with + disabled against the ceiling. -->
<Story name="Max (40 C)" args={{ value: 40 }} />

<!-- Off the ± grid: ± moves 2 °C, but any whole number can be typed. -->
<Story name="Typed odd value (23 C)" args={{ value: 23 }} />

<!-- The form's second instance: percent format, 0-100, ± in fives, still unset. -->
<Story name="Humidity unset" args={humidity} />

<!-- Humidity with a value, the state a logged ascent restores into. -->
<Story name="Humidity mid" args={{ ...humidity, value: 45 }} />

<!-- Humidity at the top of its range. -->
<Story name="Humidity max" args={{ ...humidity, value: 100 }} />

<!-- A long label next to a wide value: the header row should stay on one line. -->
<Story name="Long label" args={{ ...humidity, label: 'Relative humidity at the block', value: 85 }} />
