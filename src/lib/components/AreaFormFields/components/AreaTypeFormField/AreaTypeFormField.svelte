<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import FormFieldError from '$lib/components/FormFieldError'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  let modalOpen = $state(false)
</script>

<label class="label mt-4">
  <span>
    Type

    <Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title="Area Type">
      {#snippet trigger()}
        <i class="sl-2 fa-regular fa-circle-question"></i>
      {/snippet}

      {#snippet content()}
        <ul class="mt-4 list-inside list-disc space-y-2">
          <li>Sector: Can contain blocks and routes</li>
          <li>Crag: Include multiple sectors</li>
          <li>Area: A group of crags and sectors</li>
        </ul>
      {/snippet}
    </Dialog>
  </span>

  <select
    aria-errormessage={field.issues() ? 'area-form-fields-type-error' : undefined}
    class="select max-h-75 overflow-auto"
    size="3"
    {...field.as('select')}
  >
    <option class="rounded p-1" value="area">Area</option>
    <option class="rounded p-1" value="crag">Crag</option>
    <option class="rounded p-1" value="sector">Sector</option>
  </select>

  <FormFieldError id="area-form-fields-type-error" issues={field.issues()} />
</label>
