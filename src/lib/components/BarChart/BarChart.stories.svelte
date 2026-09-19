<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import BarChart from './BarChart.svelte'

  const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  // The component takes all its text through props, so the stories spell out
  // the labels a real consumer would compose.
  const monthly = (values: number[]) =>
    values.map((value, index) => ({
      label: MONTHS[index],
      title: `${MONTH_NAMES[index]} 2026: ${value}`,
      value,
    }))

  const typical = monthly([3, 1, 6, 12, 18, 24, 21, 15, 27, 19, 8, 2])

  const { Story } = defineMeta({
    args: { bars: typical, label: 'Ascents per month' },
    component: BarChart,
    parameters: { layout: 'centered', width: 340 },
    tags: ['autodocs'],
    title: 'Components/BarChart',
  })

  const empty = monthly(Array.from({ length: 12 }, () => 0))

  const spike = monthly([2, 0, 1, 3, 0, 240, 4, 1, 0, 2, 1, 0])

  const single = [{ label: 'S', title: 'September 2026: 7', value: 7 }]
</script>

<!-- Twelve monthly buckets: the shape the first consumer renders. -->
<Story name="Twelve months" />

<!-- Nothing happened all year: flat baseline, not a failed render. -->
<Story name="All zeros" args={{ bars: empty }} />

<!-- One bucket: the bar fills the width rather than collapsing. -->
<Story name="Single bar" args={{ bars: single }} />

<!-- One outlier dwarfs the rest: the small bars keep a visible floor. -->
<Story name="Large outlier" args={{ bars: spike }} />

<!-- With `onselect` the bars become buttons: tapping one highlights it and its axis label, and
     tapping it again clears. A zero bar never selects, so nothing reads as "selected zero". -->
<Story name="Selectable" args={{ onselect: () => {} }} />
