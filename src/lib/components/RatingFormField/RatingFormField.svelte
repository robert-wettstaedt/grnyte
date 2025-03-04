<script lang="ts">
  import type { Route } from '$lib/db/schema'
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: Route['rating']
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
      contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm max-h-[90vh] overflow-y-auto"
      backdropClasses="backdrop-blur-sm"
    >
      {#snippet trigger()}<i></i>{/snippet}

      {#snippet content()}
        <button
          aria-label="Close"
          class="fixed top-4 right-2 btn preset-filled-primary-500 w-12 h-12 rounded-full z-10"
          onclick={() => (modalOpen = false)}
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

        <header>
          <h4 class="h4">Rating</h4>
        </header>

        <article class="opacity-60">
          <p>As objective as possible try to consider these factors:</p>

          <ul class="list-disc list-inside mt-4">
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

<div class="flex items-center justify-between h-10">
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
          <i class="fa-solid fa-star text-3xl text-warning-500"></i>
        {:else}
          <i class="fa-regular fa-star text-3xl text-warning-500"></i>
        {/if}
      </button>
    {/each}
  </div>

  {#if value != null}
    <button aria-label="Clear" class="btn preset-outlined-surface-500 h-10 w-10" onclick={() => (value = null)}>
      <i class="fa-solid fa-xmark"></i>
    </button>
  {/if}
</div>
