<script lang="ts">
  import BarChart from '$lib/components/BarChart/BarChart.svelte'
  import type { ActivityMonth } from '$lib/entities/region/stats'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'

  interface Props {
    /** Sits under the chart and says what one bar counts. */
    caption: string
    /** Oldest first. `month` is the UTC first-of-month epoch millis. */
    months: ActivityMonth[]
    /** The picked month and its count, or null when the selection clears. */
    onselect?: (picked: null | { count: number; month: number }) => void
  }

  const { caption, months, onselect }: Props = $props()

  // Formatted in UTC because the buckets are UTC first-of-month: a local formatter renders the
  // month before for anybody west of Greenwich.
  const axis = $derived(new Intl.DateTimeFormat(getLocale(), { month: 'narrow', timeZone: 'UTC' }))
  const full = $derived(new Intl.DateTimeFormat(getLocale(), { month: 'long', timeZone: 'UTC', year: 'numeric' }))

  const bars = $derived(
    months.map((entry) => ({
      label: axis.format(entry.month),
      title: `${full.format(entry.month)}: ${entry.count}`,
      value: entry.count,
    })),
  )
</script>

<div class="space-y-2">
  <BarChart
    {bars}
    label={m.region_statsActivity()}
    onselect={(bar) => onselect?.(bar == null ? null : { count: bar.value, month: months[bar.index].month })}
  />
  <p class="text-surface-600-400 text-xs">{caption}</p>
</div>
