<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: string | undefined | null
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Name

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
          <h4 class="h4">Route Naming Guidelines</h4>
        </header>

        <article class="opacity-60">
          <p class="font-semibold">When naming a route, please follow these guidelines:</p>

          <ul class="list-disc list-inside mt-4 space-y-2">
            <li>Keep names respectful and inclusive - avoid offensive, discriminatory or inappropriate content</li>
            <li>Keep names respectful and inclusive - avoid offensive, discriminatory or inappropriate content</li>
            <li>Keep names respectful and inclusive - avoid offensive, discriminatory or inappropriate content</li>
            <li>Use names appropriate for all ages</li>
            <li>Respect local cultures and Indigenous/First Nations peoples</li>
            <li>Consider existing naming themes in the area</li>
            <li>Ensure the name is unique within the climbing area</li>
            <li>Names should be appropriate for public display and publication</li>
          </ul>

          <p class="mt-4 italic">
            Remember: Route names become part of the climbing community's legacy and should reflect positively on the
            sport.
          </p>
        </article>
      {/snippet}
    </Modal>
  </span>

  <input class="input" name="name" type="text" placeholder="Enter name..." {value} />
</label>
