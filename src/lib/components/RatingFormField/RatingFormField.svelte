<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import type { Route } from '$lib/db/schema'

  interface Props {
    value: Route['rating'] | null | undefined
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4 mb-2">
  <span>
    Rating

    <Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title="Rating">
      {#snippet trigger()}<i class="sl-2 fa-regular fa-circle-question"></i>{/snippet}

      {#snippet content()}
        <p>As objective as possible try to consider these factors:</p>

        <ul class="mt-4 list-inside list-disc">
          <li>The quality of the rock and holds</li>
          <li>The quality of the landing area</li>
          <li>The climbing movement</li>
          <li>The beauty of the surrounding area</li>
          <li>Is there a topout or only a dropoff?</li>
        </ul>
      {/snippet}
    </Dialog>
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
