<script>
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import { invalidateCache } from '$lib/cache/cache'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import { config } from '$lib/config'
  import { Popover, ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)

  let loading = $state(false)
</script>

<svelte:head>
  <title>Edit {data.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit area</span>
    <a class="anchor" href={basePath}>{data.name}</a>
  {/snippet}
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  action="?/updateArea"
  method="POST"
  use:enhance={() => {
    loading = true

    return async ({ update }) => {
      loading = false
      await invalidateCache(config.cache.keys.layoutBlocks)
      await invalidateCache(config.cache.keys.layoutBlocksHash)

      return update()
    }
  }}
>
  <AreaFormFields
    description={form?.description ?? data.description}
    hasParent={data.parentFk != null}
    name={form?.name ?? data.name}
    regionFk={form?.regionFk ?? data.regionFk}
    type={form?.type ?? data.type}
  />

  <div class="mt-8 flex justify-between md:items-center">
    <div>
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    </div>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      {#if checkRegionPermission(data.userRegions, [REGION_PERMISSION_DELETE], data.regionFk)}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
          positioning={{ placement: 'top' }}
          triggerBase="btn preset-filled-error-500 !text-white"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-trash"></i>Delete area
          {/snippet}

          {#snippet content()}
            <article>
              <p>Are you sure you want to delete this area?</p>
            </article>

            <footer class="flex justify-end">
              <form
                method="POST"
                action="?/removeArea"
                use:enhance={() => {
                  loading = true

                  return async ({ update }) => {
                    loading = false
                    await invalidateCache(config.cache.keys.layoutBlocks)
                    await invalidateCache(config.cache.keys.layoutBlocksHash)

                    return update()
                  }
                }}
              >
                <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}

      <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}
        Update area</button
      >
    </div>
  </div>
</form>
