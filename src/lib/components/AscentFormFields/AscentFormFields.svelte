<script lang="ts">
  import { page } from '$app/stores'
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import type { Ascent } from '$lib/db/schema'
  import { DateTime } from 'luxon'

  interface Props {
    dateTime: Ascent['dateTime']
    gradeFk: Ascent['gradeFk']
    notes: Ascent['notes']
    type: Ascent['type'] | null
  }

  let { dateTime, gradeFk, notes, type }: Props = $props()
</script>

<label class="label mt-4">
  <span>Grade</span>
  <select class="select" name="gradeFk" value={gradeFk ?? ''}>
    <option disabled value="">-- Select grade --</option>

    {#each $page.data.grades as grade}
      <option value={grade.id}>{grade[$page.data.gradingScale]}</option>
    {/each}
  </select>
</label>

<label class="label mt-4">
  <span>Type</span>
  <select class="select max-h-[300px] overflow-auto" name="type" size="4" value={type}>
    <option value="flash"><AscentTypeLabel type="flash" /></option>
    <option value="send"><AscentTypeLabel type="send" /></option>
    <option value="repeat"><AscentTypeLabel type="repeat" /></option>
    <option value="attempt"><AscentTypeLabel type="attempt" /></option>
  </select>
</label>

<label class="label mt-4">
  <span>Date</span>
  <input
    class="input"
    max={DateTime.now().toISODate()}
    name="dateTime"
    title="Input (date)"
    type="date"
    value={DateTime.fromSQL(dateTime).toISODate()}
  />
</label>

<label class="label mt-4">
  <span>Notes</span>
  <textarea hidden name="notes" value={notes}></textarea>

  <MarkdownEditor bind:value={notes} />
</label>
