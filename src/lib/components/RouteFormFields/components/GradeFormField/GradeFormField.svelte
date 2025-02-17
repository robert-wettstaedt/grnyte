<script lang="ts">
  import { page } from '$app/stores'
  import type { Route } from '$lib/db/schema'
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: Route['gradeFk']
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Grade

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
          <h4 class="h4">Grade opinions</h4>
        </header>

        <article class="opacity-60">
          <p>
            This grade is merely a suggestion and not the final grade of the route. Users can state their opinion on the
            grade when logging an ascent of the route.
          </p>

          <p class="mt-4">The final grade will be the average of all the opinions.</p>
        </article>
      {/snippet}
    </Modal>
  </span>

  <select class="select" name="gradeFk" value={value ?? ''}>
    <option disabled value="">-- Select grade --</option>

    {#each $page.data.grades as grade}
      <option value={grade.id}>{grade[$page.data.gradingScale]}</option>
    {/each}
  </select>
</label>
