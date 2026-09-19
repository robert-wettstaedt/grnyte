<!--
  The "where did this clip come from" URL field. Shared by the upload sheet
  (MediaDropZone) and the after-the-fact editor (SourceSheet) so both read the same.
  Raw text in, `normalizeSource`/`isValidSource` (entities/file/upload) do the rest.
-->
<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** From `isValidSource`; drives the hint copy, the caller gates its own submit on it. */
    valid: boolean
    /** Raw text as typed; run it through `normalizeSource` before sending. */
    value: string
  }

  let { valid, value = $bindable() }: Props = $props()
  const id = $props.id()
</script>

<div class="space-y-1.5">
  <label class="text-surface-700-300 block text-sm font-semibold" for={id}>
    {m.upload_sourceLabel()}
  </label>
  <input
    autocomplete="off"
    bind:value
    class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 font-mono text-sm focus:ring-0 focus:outline-none"
    {id}
    inputmode="url"
    placeholder={m.upload_sourcePlaceholder()}
    type="text"
  />
  <p class={['text-sm', valid ? 'text-surface-600-400' : 'text-error-500']}>
    {valid ? m.upload_sourceHint() : m.upload_sourceInvalid()}
  </p>
</div>
