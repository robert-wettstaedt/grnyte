<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  interface Props {
    text: string
    href: string
    /** Whether the current values may be submitted (drives the footer button). */
    canSubmit: boolean
    oncancel: () => void
    onsubmit: () => void
  }

  let { text = $bindable(), href = $bindable(), canSubmit, oncancel, onsubmit }: Props = $props()

  const inputClass =
    'border-surface-300-700 bg-surface-50-950 focus:border-primary-500 w-full rounded-lg border px-3 py-2 text-sm focus:ring-0 focus:outline-none'
</script>

<form
  class="space-y-3"
  onsubmit={(event) => {
    event.preventDefault()
    onsubmit()
  }}
>
  <label class="block space-y-1">
    <span class="text-surface-600-400 text-sm font-semibold">{m.editor_linkText()}</span>
    <input class={inputClass} bind:value={text} autocomplete="off" />
  </label>

  <label class="block space-y-1">
    <span class="text-surface-600-400 text-sm font-semibold">{m.editor_linkUrl()}</span>
    <input
      {@attach (node) => node.focus()}
      class={inputClass}
      bind:value={href}
      autocomplete="off"
      inputmode="url"
      placeholder="https://"
      type="url"
    />
  </label>

  <!-- Mobile uses the sheet header's back/confirm buttons, so the footer is desktop-only
       (matches the Modal's 48rem mobile↔desktop switch). -->
  <footer class="hidden justify-end gap-2 pt-1 md:flex">
    <button type="button" class="btn preset-tonal" onclick={oncancel}>{m.common_cancel()}</button>
    <button type="submit" class="btn preset-filled-primary-500" disabled={!canSubmit}>
      {m.editor_insertLink()}
    </button>
  </footer>
</form>
