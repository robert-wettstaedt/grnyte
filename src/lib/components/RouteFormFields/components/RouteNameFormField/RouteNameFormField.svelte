<script lang="ts">
  import Dialog from '$lib/components/Dialog'

  interface Props {
    value: string | undefined | null
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Name

    <Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title="Route Naming Guidelines">
      {#snippet trigger()}<i class="sl-2 fa-regular fa-circle-question"></i>{/snippet}

      {#snippet content()}
        <p class="font-semibold">When naming a route, please follow these guidelines:</p>

        <ul class="mt-4 list-inside list-disc space-y-2">
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
      {/snippet}
    </Dialog>
  </span>

  <input bind:value class="input" name="name" type="text" placeholder="Leave empty if unknown" />
</label>
