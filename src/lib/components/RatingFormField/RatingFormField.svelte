<script lang="ts">
  import type { Route } from '$lib/db/schema'
  import { Modal, Rating } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: NonNullable<Route['rating']> | undefined
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Rating

    <Modal
      bind:open={modalOpen}
      triggerBase="sl-2 fa-regular fa-circle-question"
      contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm max-h-[90vh] overflow-y-auto"
      backdropClasses="backdrop-blur-sm"
    >
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

<Rating bind:value count={3}>
  {#snippet iconEmpty()}
    <i class="fa-regular fa-star text-3xl text-warning-500"></i>
  {/snippet}
  {#snippet iconFull()}
    <i class="fa-solid fa-star text-3xl text-warning-500"></i>
  {/snippet}
</Rating>
