<script lang="ts">
  import { pageState } from '$lib/components/Layout'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import type { Row } from '$lib/db/zero'
  import AreaTypeFormField from './components/AreaTypeFormField'

  type Props = Partial<Row<'areas'>>

  let { id, name, regionFk, parentFk, ...rest }: Props = $props()
  let type = $state(rest.type ?? 'area')
  let description = $state(rest.description ?? '')

  let adminRegions = $derived(pageState.userRegions.filter((region) => region.role === 'region_admin'))
</script>

{#if id != null}
  <input type="hidden" name="id" value={id} />
{/if}

<label class="label">
  <span>Name</span>
  <input class="input" name="name" type="text" placeholder="Enter name..." value={name} />
</label>

{#if parentFk}
  <AreaTypeFormField bind:value={type} />

  <input type="hidden" name="parentFk" value={parentFk ?? ''} />
  <input type="hidden" name="regionFk" value={regionFk ?? ''} />
{:else}
  <label class="label mt-4">
    <span>Region</span>
    <select
      class="select"
      name="regionFk"
      value={adminRegions.length === 1 ? adminRegions[0].regionFk : (regionFk ?? '')}
    >
      <option disabled value="">-- Select region --</option>
      {#each adminRegions as region}
        <option value={region.regionFk}>{region.name}</option>
      {/each}
    </select>
  </label>
{/if}

<label class="label mt-4">
  <span>Description</span>
  <textarea hidden name="description" value={description ?? ''}></textarea>

  <MarkdownEditor bind:value={description} />
</label>
