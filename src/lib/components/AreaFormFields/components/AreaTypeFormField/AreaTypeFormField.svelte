<script lang="ts">
  import type { Row } from '$lib/db/zero'
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: Row<'areas'>['type'] | null | undefined
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Type

    <Modal
      open={modalOpen}
      onOpenChange={(event) => (modalOpen = event.open)}
      triggerBase="sl-2 fa-regular fa-circle-question"
      contentBase="card bg-surface-100-900 max-h-[90vh] max-w-screen-sm space-y-4 overflow-y-auto p-4 shadow-xl"
      backdropClasses="backdrop-blur-sm"
    >
      {#snippet trigger()}<i></i>{/snippet}

      {#snippet content()}
        <button
          aria-label="Close"
          class="btn preset-filled-primary-500 fixed top-4 right-2 z-10 h-12 w-12 rounded-full"
          onclick={() => (modalOpen = false)}
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

        <header>
          <h4 class="h4">Area Type</h4>
        </header>

        <article class="opacity-60">
          <ul class="mt-4 list-inside list-disc space-y-2">
            <li>Sector: Can contain blocks and routes</li>
            <li>Crag: Include multiple sectors</li>
            <li>Area: A group of crags and sectors</li>
          </ul>
        </article>
      {/snippet}
    </Modal>
  </span>

  <select
    class="select max-h-[300px] overflow-auto"
    name="type"
    onchange={(event) => (value = event.currentTarget.value as Row<'areas'>['type'])}
    size="3"
    value={value ?? 'area'}
  >
    <option value="area">Area</option>
    <option value="crag">Crag</option>
    <option value="sector">Sector</option>
  </select>
</label>
