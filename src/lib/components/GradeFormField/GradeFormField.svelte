<script lang="ts">
  import { page } from '$app/state'
  import type { Route } from '$lib/db/schema'
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: Route['gradeFk']
    withModal?: boolean
  }

  let { value = $bindable(), withModal = false }: Props = $props()

  let grade = $state(value ?? '')

  $effect(() => {
    grade = value ?? ''
  })

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Grade

    {#if withModal}
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
            <h4 class="h4">Grade opinions</h4>
          </header>

          <article class="opacity-60">
            <p>
              This grade is merely a suggestion and not the final grade of the route. Users can state their opinion on
              the grade when logging an ascent of the route.
            </p>

            <p class="mt-4">The final grade will be the average of all the opinions.</p>
          </article>
        {/snippet}
      </Modal>
    {/if}
  </span>

  <input name="gradeFk" type="hidden" {value} />

  <div class="relative">
    <select bind:value={grade} class="select" onchange={(event) => (value = Number(event.currentTarget.value))}>
      <option disabled value="">-- Select grade --</option>

      {#each page.data.grades as grade}
        <option value={grade.id}>{grade[page.data.gradingScale]}</option>
      {/each}
    </select>

    {#if typeof grade === 'number'}
      <button
        aria-label="Clear"
        class="btn preset-outlined-surface-500 absolute top-0 right-0 h-10 w-10"
        onclick={(event) => {
          event.preventDefault()
          value = null
        }}
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    {/if}
  </div>
</label>
