<script lang="ts">
  import { untrack } from 'svelte'
  import FormGate from './FormGate.svelte'
  import type { FormWait } from './gate'

  interface Props {
    log: string[]
    wait: FormWait
  }

  const { log, wait }: Props = $props()
</script>

<FormGate
  action={{ label: 'Save' }}
  cancelTo="/"
  seed={{
    form: { element: null, fields: { allIssues: () => undefined, set: () => undefined } },
    values: ([row]) => void log.push(`seed:${row.id}`),
  }}
  title="Edit"
  waitFor={[wait]}
>
  {#snippet children([row])}
    <p {@attach () => untrack(() => void log.push(`mount:${row.id}`))}>{row.id}</p>
  {/snippet}
</FormGate>
