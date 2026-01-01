<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import type { Row } from '$lib/db/zero'

  interface Props {
    value: Row<'areas'>['type'] | null | undefined
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Type

    <Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title="Area Type">
      {#snippet trigger()}
        <i class="sl-2 fa-regular fa-circle-question"></i>
      {/snippet}

      {#snippet content()}
        <ul class="mt-4 list-inside list-disc space-y-2">
          <li>Sector: Can contain blocks and routes</li>
          <li>Crag: Include multiple sectors</li>
          <li>Area: A group of crags and sectors</li>
        </ul>
      {/snippet}
    </Dialog>
  </span>

  <select
    class="select max-h-[300px] overflow-auto"
    name="type"
    onchange={(event) => (value = event.currentTarget.value as Row<'areas'>['type'])}
    size="3"
    value={value ?? 'area'}
  >
    <option class="rounded p-1" value="area">Area</option>
    <option class="rounded p-1" value="crag">Crag</option>
    <option class="rounded p-1" value="sector">Sector</option>
  </select>
</label>
