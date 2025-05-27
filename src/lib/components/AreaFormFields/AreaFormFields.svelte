<script lang="ts">
  import { page } from '$app/state'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import type { Area } from '$lib/db/schema'

  interface Props {
    description: Area['description']
    hasParent: boolean
    name: Area['name']
    regionFk: Area['regionFk'] | undefined
    type: Area['type']
  }

  let { description = $bindable(), name, regionFk, type, hasParent }: Props = $props()

  let adminRegions = $derived(page.data.userRegions.filter((region) => region.role === 'region_admin'))
</script>

<label class="label">
  <span>Name</span>
  <input class="input" name="name" type="text" placeholder="Enter name..." value={name} />
</label>

{#if hasParent}
  <label class="label mt-4">
    <span>Type</span>
    <select class="select max-h-[300px] overflow-auto" name="type" size="3" value={type}>
      <option value="area">Area</option>
      <option value="crag">Crag</option>
      <option value="sector">Sector</option>
    </select>
  </label>

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
  <textarea hidden name="description" value={description}></textarea>

  <MarkdownEditor bind:value={description} />
</label>
