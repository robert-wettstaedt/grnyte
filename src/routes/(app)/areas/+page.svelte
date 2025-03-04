<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { EDIT_PERMISSION } from '$lib/auth'
  import GenericList from '$lib/components/GenericList'
  import GradeHistogram from '$lib/components/GradeHistogram'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  let { data } = $props()
</script>

<svelte:head>
  <title>Areas - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Areas
  {/snippet}

  {#snippet trail()}
    {#if data.userPermissions?.includes(EDIT_PERMISSION)}
      <a class="btn btn-sm preset-filled-primary-500" href="/areas/add">
        <i class="fa-solid fa-plus"></i> Add area
      </a>
    {/if}
  {/snippet}
</AppBar>

<div class="block card p-2 md:p-4 my-8 preset-filled-surface-100-900">
  {#if data.areas.length === 0}
    No areas yet
  {:else}
    <GenericList
      items={data.areas.map((item) => ({ ...item, pathname: `/areas/${item.slug}-${item.id}` }))}
      listClasses="border-b-[1px] border-surface-700 last:border-none py-2"
      wrap={false}
    >
      {#snippet left(item)}
        {item.name}
      {/snippet}

      {#snippet right(item)}
        <div class="flex flex-col">
          <GradeHistogram
            axes={false}
            data={item.grades}
            spec={{
              width: 100,
            }}
            opts={{
              height: 38,
            }}
          />

          <div class="flex items-center justify-end text-sm opacity-70">
            {item.numOfRoutes}

            {#if item.numOfRoutes === 1}
              route
            {:else}
              routes
            {/if}
          </div>
        </div>
      {/snippet}
    </GenericList>
  {/if}
</div>
