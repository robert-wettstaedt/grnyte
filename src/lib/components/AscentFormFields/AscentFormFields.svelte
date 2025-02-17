<script lang="ts">
  import { page } from '$app/stores'
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import type { FileUploadProps } from '$lib/components/FileUpload'
  import FileUpload from '$lib/components/FileUpload'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import type { Ascent } from '$lib/db/schema'
  import { DateTime } from 'luxon'

  interface Props {
    dateTime: Ascent['dateTime']
    fileUploadProps: FileUploadProps
    gradeFk: Ascent['gradeFk']
    notes: Ascent['notes']
    rating: NonNullable<Ascent['rating']> | undefined
    type: Ascent['type'] | null
  }

  let { dateTime, gradeFk, notes, rating, type, fileUploadProps }: Props = $props()
</script>

<label class="label mt-4">
  <span>Type</span>
  <select class="select max-h-[300px] overflow-auto" name="type" size="4" bind:value={type}>
    <option value="flash"><AscentTypeLabel type="flash" /></option>
    <option value="send"><AscentTypeLabel type="send" /></option>
    <option value="repeat"><AscentTypeLabel type="repeat" /></option>
    <option value="attempt"><AscentTypeLabel type="attempt" /></option>
  </select>
</label>

<label class="label mt-4">
  <span>Grade</span>
  <select class="select" name="gradeFk" value={gradeFk ?? ''}>
    <option disabled value="">-- Select grade --</option>

    {#each $page.data.grades as grade}
      <option value={grade.id}>{grade[$page.data.gradingScale]}</option>
    {/each}
  </select>
</label>

<RatingFormField bind:value={rating} />

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

<FileUpload {...fileUploadProps} />

<label class="label mt-4">
  <span>Notes</span>
  <textarea hidden name="notes" value={notes}></textarea>

  <MarkdownEditor bind:value={notes} />
</label>
