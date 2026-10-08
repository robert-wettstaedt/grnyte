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
  seed={([row]) => log.push(`seed:${row.id}`)}
  title="Edit"
  waitFor={[wait]}
>
  {#snippet children([row])}
    <p {@attach () => untrack(() => void log.push(`mount:${row.id}`))}>{row.id}</p>
  {/snippet}
</FormGate>
