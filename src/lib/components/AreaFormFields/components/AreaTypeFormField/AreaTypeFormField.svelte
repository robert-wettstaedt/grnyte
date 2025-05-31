<script lang="ts">
  import type { Area } from '$lib/db/schema'
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: Area['type']
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
      contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm max-h-[90vh] overflow-y-auto"
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

  <select class="select max-h-[300px] overflow-auto" name="type" size="3" {value}>
    <option value="area">Area</option>
    <option value="crag">Crag</option>
    <option value="sector">Sector</option>
  </select>
</label>
