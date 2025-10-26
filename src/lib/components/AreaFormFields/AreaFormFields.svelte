<script lang="ts">
  import { pageState } from '$lib/components/Layout'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import type { Row } from '$lib/db/zero'
  import type { AreaActionValuesIn } from '$lib/forms/schemas'
  import type { RemoteFormFields } from '@sveltejs/kit'
  import AreaTypeFormField from './components/AreaTypeFormField'

  interface Props {
    defaultValue?: Partial<Row<'areas'>>
    fields: RemoteFormFields<AreaActionValuesIn>
  }

  let { defaultValue, fields }: Props = $props()
  let type = $state(defaultValue?.type ?? 'area')
  let description = $state(defaultValue?.description ?? '')

  const adminRegions = $derived(pageState.userRegions.filter((region) => region.role === 'region_admin'))

  $effect(() => {
    if (adminRegions.length === 1) {
      fields.regionFk.set(String(adminRegions[0].regionFk))
    }
  })

  $inspect(fields.regionFk.as('select'))
</script>

{#if defaultValue?.id != null}
  <input type="hidden" name="id" value={defaultValue.id} />
{/if}

<label class="label">
  <span>Name</span>
  <input
    aria-errormessage={fields.name.issues() ? 'area-form-fields-name-error' : undefined}
    class="input"
    placeholder="Enter name..."
    {...fields.name.as('text')}
  />

  {#each fields.name.issues() as issue}
    <div id="area-form-fields-name-error">
      <p class="text-error-500 text-sm opacity-80">{issue.message}</p>
    </div>
  {/each}
</label>

{#if defaultValue?.parentFk}
  <AreaTypeFormField bind:value={type} />

  <input type="hidden" name="parentFk" value={defaultValue.parentFk ?? ''} />
  <input type="hidden" name="regionFk" value={defaultValue.regionFk ?? ''} />
{:else}
  <label class="label mt-4">
    <span>Region</span>
    <select
      aria-errormessage={fields.regionFk.issues() ? 'area-form-fields-name-error' : undefined}
      class="select"
      {...fields.regionFk.as('select')}
    >
      <option disabled value="">-- Select region --</option>
      {#each adminRegions as region}
        <option value={region.regionFk}>{region.name}</option>
      {/each}
    </select>
  </label>

  {#each fields.regionFk.issues() as issue}
    <div id="area-form-fields-name-error">
      <p class="text-error-500 text-sm opacity-80">{issue.message}</p>
    </div>
  {/each}
{/if}

<label class="label mt-4">
  <span>Description</span>
  <textarea hidden name="description" value={description ?? ''}></textarea>

  <MarkdownEditor bind:value={description} />
</label>
