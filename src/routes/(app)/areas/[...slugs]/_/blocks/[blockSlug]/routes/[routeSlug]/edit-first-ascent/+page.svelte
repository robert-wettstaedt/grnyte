<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import MultiSelect from '$lib/components/MultiSelect'
  import RouteName from '$lib/components/RouteName'
  import { Popover } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(data.grades.find((grade) => grade.id === data.route.gradeFk))
</script>

<svelte:head>
  <title>
    Edit FA of
    {data.route.rating == null ? '' : `${Array(data.route.rating).fill('★').join('')} `}
    {data.route.name}
    {grade == null ? '' : ` (${grade[data.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit FA of</span>
    <a class="anchor" href={basePath}>
      <RouteName route={data.route} />
    </a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" action="?/updateFirstAscent" method="POST" use:enhance>
  <label class="label">
    <span>Year</span>
    <input
      class="input"
      max={new Date().getFullYear()}
      min={1970}
      name="year"
      placeholder="Enter year..."
      type="number"
      value={form?.year ?? data.route.firstAscentYear}
    />
  </label>

  <div class="mt-4">Climber</div>
  <MultiSelect
    name="climberName"
    options={data.firstAscensionists.map((firstAscensionist) => firstAscensionist.name)}
    value={form?.climberName ?? data.route.firstAscents.map((fa) => fa.firstAscensionist.name)}
  />

  <div class="mt-8 flex justify-between md:items-center">
    <div>
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    </div>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      {#if checkRegionPermission(data.userRegions, [REGION_PERMISSION_DELETE], data.route.regionFk)}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
          positioning={{ placement: 'top' }}
          triggerBase="btn preset-filled-error-500 !text-white"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-trash"></i>Delete FA
          {/snippet}

          {#snippet content()}
            <article>
              <p>Are you sure you want to delete this FA?</p>
            </article>

            <footer class="flex justify-end">
              <form method="POST" action="?/removeFirstAscent" use:enhance>
                <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}

      <button class="btn preset-filled-primary-500" type="submit">Update FA</button>
    </div>
  </div>
</form>
