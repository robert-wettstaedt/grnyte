<script lang="ts">
  import type { Route } from '$lib/db/schema'
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: Route['rating'] | null | undefined
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Rating

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
          <h4 class="h4">Rating</h4>
        </header>

        <article class="opacity-60">
          <p>As objective as possible try to consider these factors:</p>

          <ul class="mt-4 list-inside list-disc">
            <li>The quality of the rock and holds</li>
            <li>The quality of the landing area</li>
            <li>The climbing movement</li>
            <li>The beauty of the surrounding area</li>
            <li>Is there a topout or only a dropoff?</li>
          </ul>
        </article>
      {/snippet}
    </Modal>
  </span>

  <input name="rating" type="hidden" {value} />
</label>

<div class="flex h-10 items-center justify-between">
  <div class="flex gap-1">
    {#each [1, 2, 3] as rating}
      <button
        aria-label={`Rating ${rating}`}
        onclick={(event) => {
          event.preventDefault()
          value = rating
        }}
      >
        {#if value != null && value >= rating}
          <i class="fa-solid fa-star text-warning-500 text-3xl"></i>
        {:else}
          <i class="fa-regular fa-star text-warning-500 text-3xl"></i>
        {/if}
      </button>
    {/each}
  </div>

  {#if value != null}
    <button aria-label="Clear" class="btn preset-filled-surface-500 h-9 w-9" onclick={() => (value = null)}>
      <i class="fa-solid fa-xmark"></i>
    </button>
  {/if}
</div>
