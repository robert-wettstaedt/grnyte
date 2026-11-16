<script lang="ts">
  import { createFormStore } from '$lib/forms/store.svelte'
  import * as z from '$lib/forms/zod'
  import type { ComponentProps } from 'svelte'
  import CodeEntry from './CodeEntry.svelte'

  // CodeEntry inside a screen's <form>, as on the re-auth screens.
  type Props = Omit<ComponentProps<typeof CodeEntry>, 'field'> & { onformsubmit: () => void }

  const { onformsubmit, ...props }: Props = $props()
  const store = createFormStore(z.object({ code: z.string() }))
</script>

<form
  onsubmit={(event) => {
    event.preventDefault()
    onformsubmit()
  }}
>
  <CodeEntry {...props} field={store.fields.code} />
</form>
