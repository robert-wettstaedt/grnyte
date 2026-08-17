<script lang="ts">
  import { GRADE_COLORS } from '$lib/entities/grade/color'
  import { calendarDay } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'

  interface Props {
    /** Ascent count per day, keyed by the day's UTC-midnight epoch millis (an ascent's `dateTime`). */
    counts: Map<number, number>
    /** Fires when a day is tapped (its UTC-midnight millis + count), or null when deselected. */
    onselect?: (day: null | { count: number; day: number }) => void
  }

  const { counts, onselect }: Props = $props()

  const DAY = 86_400_000
  const WEEKS = 53

  interface Cell {
    count: number
    /** UTC-midnight epoch millis. */
    day: number
  }

  // A calendar date (an ascent's `dateTime`) is UTC-midnight millis; align "today" the same way
  // so the current day lands in the right cell regardless of timezone.
  const today = $derived(calendarDay(now()))

  // Columns = weeks (Monday-first), rows = weekdays. The grid starts on the Monday
  // 52 weeks before this week and runs to today; future cells are omitted.
  const weeks = $derived.by(() => {
    const todayWeekday = (new Date(today).getUTCDay() + 6) % 7
    const start = today - todayWeekday * DAY - (WEEKS - 1) * 7 * DAY
    const columns: Cell[][] = []
    for (let w = 0; w < WEEKS; w += 1) {
      const column: Cell[] = []
      for (let d = 0; d < 7; d += 1) {
        const day = start + (w * 7 + d) * DAY
        if (day > today) {
          break
        }
        column.push({ count: counts.get(day) ?? 0, day })
      }
      columns.push(column)
    }
    return columns
  })

  // A month label sits above the first column that opens a new month, so the axis
  // reads as a calendar without labelling every week.
  const monthShort = $derived(new Intl.DateTimeFormat(getLocale(), { month: 'short', timeZone: 'UTC' }))
  const monthLabels = $derived.by(() =>
    weeks.map((column, index) => {
      const first = column[0]
      if (first == null) {
        return ''
      }
      const month = new Date(first.day).getUTCMonth()
      const prev = weeks[index - 1]?.[0]
      const prevMonth = prev == null ? -1 : new Date(prev.day).getUTCMonth()
      return month === prevMonth ? '' : monthShort.format(first.day)
    }),
  )

  // Four intensity buckets mapped onto the app's grade band scale (light → dark =
  // quiet → busy), so the heatmap shares the product palette.
  const bucketColor = (count: number): string => {
    if (count <= 0) {
      return ''
    }
    if (count === 1) {
      return GRADE_COLORS[0]
    }
    if (count <= 3) {
      return GRADE_COLORS[1]
    }
    if (count <= 5) {
      return GRADE_COLORS[2]
    }
    return GRADE_COLORS[3]
  }

  const dayFormat = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full', timeZone: 'UTC' }))
  const label = (cell: Cell): string => `${dayFormat.format(cell.day)}: ${m.profile_climbsCount({ count: cell.count })}`

  // Tapping a cell surfaces its date + count in the caption (cells are too small for
  // a hover tooltip on touch); desktop also gets the native title on hover.
  let selected = $state<Cell | null>(null)

  // The most recent weeks sit at the right edge; open scrolled to them. Runs once on
  // mount (no reactive reads), so the daily `now()` tick can't yank the user back.
  const scrollToEnd = (node: HTMLDivElement): void => {
    node.scrollLeft = node.scrollWidth
  }
</script>

<div>
  <div class="overflow-x-auto pb-1" {@attach scrollToEnd}>
    <div class="inline-flex flex-col gap-1">
      <!-- Month axis: one label per column, aligned above the week it opens. -->
      <div class="flex gap-0.75 ps-0.5">
        {#each monthLabels as monthLabel, index (index)}
          <span class="text-surface-500 w-3.25 flex-none text-[9px] leading-none">{monthLabel}</span>
        {/each}
      </div>

      <div class="flex gap-0.75">
        {#each weeks as column, weekIndex (weekIndex)}
          <div class="flex flex-col gap-0.75">
            {#each column as cell (cell.day)}
              {@const bg = bucketColor(cell.count)}
              <button
                type="button"
                class="size-3.25 flex-none rounded-[3px]"
                class:bg-surface-200-800={bg === ''}
                class:ring-2={selected?.day === cell.day}
                class:ring-primary-500={selected?.day === cell.day}
                style:background-color={bg === '' ? undefined : bg}
                title={label(cell)}
                aria-label={label(cell)}
                aria-pressed={selected?.day === cell.day}
                onclick={() => {
                  selected = selected?.day === cell.day ? null : cell
                  onselect?.(selected)
                }}
              ></button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <p class="text-surface-600-400 mt-2 text-xs" aria-live="polite">
    {selected == null ? m.profile_activityHint() : label(selected)}
  </p>
</div>
