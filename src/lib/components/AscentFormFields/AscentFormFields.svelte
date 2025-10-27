<script lang="ts">
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import type { FileUploadProps } from '$lib/components/FileUpload'
  import FileUpload from '$lib/components/FileUpload'
  import GradeFormField from '$lib/components/GradeFormField'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import { ascentTypeEnum } from '$lib/db/schema'
  import type { Row } from '$lib/db/zero'
  import { DateTime } from 'luxon'

  interface Props {
    dateTime: Row<'ascents'>['dateTime'] | null | undefined
    fileUploadProps: FileUploadProps
    gradeFk: Row<'ascents'>['gradeFk'] | null | undefined
    notes: Row<'ascents'>['notes'] | null | undefined
    rating: Row<'ascents'>['rating'] | null | undefined
    type: Row<'ascents'>['type'] | null | undefined
  }

  let {
    dateTime = $bindable(),
    fileUploadProps,
    gradeFk = $bindable(),
    notes = $bindable(),
    rating = $bindable(),
    type = $bindable(),
  }: Props = $props()
</script>

<label class="label mt-4">
  <span>Type</span>

  <input name="type" type="hidden" value={type} />

  <div class="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
    {#each ascentTypeEnum as ascentType}
      <label
        class="flex cursor-pointer items-center justify-center rounded-md border-2 p-2 transition-colors md:p-4 {type ===
        ascentType
          ? 'bg-primary-500 border-primary-500'
          : 'border-surface-500 bg-transparent'}"
      >
        <input
          checked={type === ascentType}
          class="hidden"
          name="type"
          onchange={() => (type = ascentType)}
          type="radio"
          value={ascentType}
        />
        <AscentTypeLabel type={ascentType} />
      </label>
    {/each}
  </div>
</label>

<GradeFormField bind:value={gradeFk} />

<RatingFormField bind:value={rating} />

<label class="label mt-4">
  <span>Date</span>
  <input
    class="input"
    max={DateTime.now().toISODate()}
    name="dateTime"
    onchange={(event) => {
      const value = DateTime.fromISO(event.currentTarget.value)
      dateTime = value.isValid ? value.toMillis() : null
    }}
    title="Input (date)"
    type="date"
    value={DateTime.fromMillis(dateTime ?? Date.now()).toISODate()}
  />
</label>

<FileUpload {...fileUploadProps} />

<label class="label mt-4">
  <span>Notes</span>
  <textarea hidden name="notes" value={notes}></textarea>

  <MarkdownEditor bind:value={notes} />
</label>
