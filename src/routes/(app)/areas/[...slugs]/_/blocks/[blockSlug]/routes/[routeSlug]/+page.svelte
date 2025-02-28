<script lang="ts">
  import { enhance } from '$app/forms'
  import { afterNavigate, goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'
  import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
  import ActivityFeed from '$lib/components/ActivityFeed'
  import AppBar from '$lib/components/AppBar'
  import FileViewer from '$lib/components/FileViewer'
  import References from '$lib/components/References'
  import CorrectedGrade from '$lib/components/RouteGrade/components/CorrectedGrade'
  import RouteName from '$lib/components/RouteName'
  import TopoViewer, { selectedRouteStore } from '$lib/components/TopoViewer'
  import { Popover, ProgressRing, Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { data } = $props()
  let blockPath = $derived(`/areas/${$page.params.slugs}/_/blocks/${$page.params.blockSlug}`)
  let basePath = $derived(`${blockPath}/routes/${$page.params.routeSlug}`)

  let selectedTopoIndex = $state<number | undefined>(undefined)

  let files = $state(data.files)
  $effect(() => {
    files = data.files
  })

  let grade = $derived(data.grades.find((grade) => grade.id === data.route.gradeFk))

  let syncing = $state(false)

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    tabValue = $page.url.hash.length > 0 ? $page.url.hash : '#info'
    selectedRouteStore.set(data.route.id)

    const index = data.topos.findIndex((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === data.route.id))
    selectedTopoIndex = index === -1 ? undefined : index
  })
  onMount(() => {
    tabValue = $page.url.hash.length > 0 ? $page.url.hash : '#info'
    selectedRouteStore.set(data.route.id)
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onFocusChange'] = (event) => {
    goto($page.url.pathname + event.focusedValue, { replaceState: true })
  }

  const gradeMap = $derived.by(() => {
    return data.route.ascents
      .filter((ascent) => ascent.gradeFk != null)
      .reduce((map, ascent) => {
        const count = map.get(ascent.gradeFk!) ?? 0
        map.set(ascent.gradeFk!, count + 1)
        return map
      }, new Map<number, number>())
  })

  onMount(() => {
    return selectedRouteStore.subscribe((value) => {
      if (value == null && data.route != null) {
        selectedRouteStore.set(data.route.id)
      }
    })
  })
</script>

<svelte:head>
  <title>
    {data.route.rating == null ? '' : `${Array(data.route.rating).fill('★').join('')} `}
    {data.route.name}
    {grade == null ? '' : ` (${grade[data.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar hasActions>
  {#snippet lead()}
    <RouteName classes="flex-wrap" route={data.route} />
  {/snippet}

  {#snippet actions()}
    <a class="btn btn-sm preset-filled-primary-500" href={`${basePath}/ascents/add`}>
      <i class="fa-solid fa-check"></i>
      Log ascent
    </a>

    {#if data.route.externalResources?.externalResource8a?.url != null}
      <a
        class="btn btn-sm preset-outlined-primary-500"
        href={data.route.externalResources.externalResource8a.url}
        target="_blank"
      >
        <img src={Logo8a} alt="8a" width={16} height={16} />

        <span class="md:hidden"> Show on 8a.nu </span>
      </a>
    {/if}

    {#if data.route.externalResources?.externalResource27crags?.url != null}
      <a
        class="btn btn-sm preset-outlined-primary-500"
        href={data.route.externalResources.externalResource27crags.url}
        target="_blank"
      >
        <img src={Logo27crags} alt="27crags" width={16} height={16} />

        <span class="md:hidden"> Show on 27crags </span>
      </a>
    {/if}

    {#if data.route.externalResources?.externalResourceTheCrag?.url != null}
      <a
        class="btn btn-sm preset-outlined-primary-500"
        href={data.route.externalResources.externalResourceTheCrag.url}
        target="_blank"
      >
        <img src={LogoTheCrag} alt="The Crag" width={16} height={16} />

        <span class="md:hidden"> Show on theCrag </span>
      </a>
    {/if}

    {#if data.userPermissions?.includes(EDIT_PERMISSION)}
      <form
        class="leading-none"
        method="POST"
        action="?/syncExternalResources"
        use:enhance={({}) => {
          syncing = true

          return ({ result }) => {
            syncing = false

            if (result.type === 'success') {
              invalidateAll()
            }
          }
        }}
      >
        <button class="btn btn-sm preset-outlined-primary-500" disabled={syncing} type="submit">
          {#if syncing}
            <span class="me-2">
              <ProgressRing size="size-sm" value={null} />
            </span>
          {:else}
            <i class="fa-solid fa-sync"></i>
          {/if}

          Sync external resources
        </button>
      </form>

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/add-file`}>
        <i class="fa-solid fa-cloud-arrow-up"></i>Upload file
      </a>

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit-first-ascent`}>
        <i class="fa-solid fa-pen"></i>Edit FA
      </a>

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit`}>
        <i class="fa-solid fa-pen"></i>Edit route
      </a>
    {/if}
  {/snippet}

  {#snippet headline()}
    <Tabs
      fluid
      listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]"
      listGap="0"
      onFocusChange={onChangeTab}
      value={tabValue}
    >
      {#snippet list()}
        <Tabs.Control value="#info">Info</Tabs.Control>

        {#if data.topos.length > 0}
          <Tabs.Control value="#topo">Topo</Tabs.Control>
        {/if}

        <Tabs.Control value="#activity">Activity</Tabs.Control>

        <Tabs.Control value="#map">Map</Tabs.Control>
      {/snippet}

      {#snippet content()}
        {#if data.topos.length > 0}
          <Tabs.Panel value="#topo">
            <div class="flex">
              <section class="w-full relative" use:fitHeightAction>
                <TopoViewer {selectedTopoIndex} initialRouteId={data.route.id} topos={data.topos}>
                  {#snippet actions()}
                    {#if data.userPermissions?.includes(EDIT_PERMISSION)}
                      <a aria-label="Edit topo" class="btn-icon preset-filled" href={`${blockPath}/topos/draw`}>
                        <i class="fa-solid fa-pen"></i>
                      </a>
                    {/if}
                  {/snippet}
                </TopoViewer>
              </section>
            </div>
          </Tabs.Panel>
        {/if}

        <Tabs.Panel value="#activity">
          <section class="p-2">
            <div class="flex justify-center mb-4">
              <a class="btn preset-filled-primary-500" href={`${basePath}/ascents/add`}>
                <i class="fa-solid fa-check"></i>
                Log ascent
              </a>
            </div>

            <ActivityFeed activities={data.feed.activities} pagination={data.feed.pagination} />
          </section>
        </Tabs.Panel>

        <Tabs.Panel value="#map">
          <div use:fitHeightAction>
            {#await import('$lib/components/BlocksMap') then BlocksMap}
              {#key data.block.id}
                <BlocksMap.default blocks={data.blocks} selectedBlock={data.block} />
              {/key}
            {/await}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="#info">
          <dl>
            <div class="flex p-2">
              <span class="flex-auto">
                <dt>FA</dt>
                <dd class="flex justify-between items-center">
                  <span class="flex flex-wrap items-center gap-2">
                    {#if data.route.firstAscents.length === 0 && data.route.firstAscentYear == null}
                      <span>unknown</span>
                    {/if}

                    {#each data.route.firstAscents as firstAscent, index}
                      {#if firstAscent.firstAscensionist.user == null}
                        <span
                          class="flex justify-between gap-2 {data.user?.firstAscensionistFk == null
                            ? 'w-full md:w-auto'
                            : ''}"
                        >
                          <a class="anchor" href={`/users/${firstAscent.firstAscensionist.name}`}>
                            {firstAscent.firstAscensionist.name}
                          </a>

                          {#if data.user?.firstAscensionistFk == null}
                            <Popover
                              arrow
                              arrowBackground="!bg-surface-200 dark:!bg-surface-800"
                              contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
                              positioning={{ placement: 'top' }}
                              triggerBase="btn btn-sm preset-outlined-primary-500 !text-white me-auto"
                            >
                              {#snippet trigger()}
                                That's me!
                              {/snippet}

                              {#snippet content()}
                                <article>
                                  <p>
                                    All FAs with the name {firstAscent.firstAscensionist.name} will be attributed to you.
                                    Are you sure that this is you?
                                  </p>
                                </article>

                                <footer class="flex justify-end">
                                  <form action="?/claimFirstAscensionist" method="POST" use:enhance>
                                    <input
                                      type="hidden"
                                      name="firstAscensionistFk"
                                      value={firstAscent.firstAscensionist.id}
                                    />

                                    <button class="btn btn-sm preset-filled-primary-500 !text-white" type="submit">
                                      Yes
                                    </button>
                                  </form>
                                </footer>
                              {/snippet}
                            </Popover>
                          {/if}
                        </span>

                        {#if index < data.route.firstAscents.length - 1}
                          <span class="hidden md:block">|</span>
                        {/if}
                      {:else}
                        <a class="anchor" href={`/users/${firstAscent.firstAscensionist.user.username}`}>
                          {firstAscent.firstAscensionist.name}
                        </a>

                        {#if index < data.route.firstAscents.length - 1}
                          <span>|</span>
                        {/if}
                      {/if}
                    {/each}

                    {#if data.route.firstAscentYear != null}
                      <span>
                        {data.route.firstAscentYear}
                      </span>
                    {/if}

                    {#if data.route.firstAscents.length === 0 && data.user?.firstAscensionistFk != null}
                      <Popover
                        arrow
                        arrowBackground="!bg-surface-200 dark:!bg-surface-800"
                        contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
                        positioning={{ placement: 'top' }}
                        triggerBase="btn btn-sm preset-outlined-primary-500 !text-white"
                      >
                        {#snippet trigger()}
                          Claim FA
                        {/snippet}

                        {#snippet content()}
                          <article>
                            <p>This FA will be attributed to you. Are you sure?</p>
                          </article>

                          <footer class="flex justify-end">
                            <form action="?/claimFirstAscent" method="POST" use:enhance>
                              <button class="btn btn-sm preset-filled-primary-500 !text-white" type="submit">
                                Yes
                              </button>
                            </form>
                          </footer>
                        {/snippet}
                      </Popover>
                    {/if}
                  </span>
                </dd>
              </span>
            </div>

            {#if data.route.description != null && data.route.description.length > 0}
              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Description</dt>
                  <dd>
                    <div class="rendered-markdown">
                      {@html data.route.description}
                    </div>
                  </dd>
                </span>
              </div>
            {/if}

            {#if data.route.tags.length > 0}
              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Tags</dt>
                  <dd class="flex gap-1 mt-1">
                    {#each data.route.tags as tag}
                      <span class="chip preset-filled-surface-900-100">
                        <i class="fa-solid fa-tag me-2"></i>
                        {tag.tagFk}
                      </span>
                    {/each}
                  </dd>
                </span>
              </div>
            {/if}

            {#if gradeMap.size > 0}
              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Grade opinions</dt>
                  <dd class="flex flex-col gap-2 mt-1">
                    {#if data.route.gradeFk != null}
                      <div class="flex items-center w-full">
                        <div class="w-28">
                          <CorrectedGrade oldGrade={data.route.gradeFk} newGrade={null} />
                        </div>

                        <span class="text-sm text-surface-500"> Original grade </span>
                      </div>
                    {/if}

                    {#each gradeMap.entries() as [grade, count]}
                      {#if count != null}
                        <div class="flex items-center w-full">
                          <div class="w-28">
                            <CorrectedGrade oldGrade={grade} newGrade={null} />
                          </div>

                          <span class="text-sm text-surface-500">
                            {count}x
                          </span>
                        </div>
                      {/if}
                    {/each}
                  </dd>
                </span>
              </div>
            {/if}

            {#await data.references then references}
              {#if references.routes.length > 0}
                <div class="flex p-2">
                  <span class="flex-auto">
                    <dt>Mentioned in</dt>

                    <dd class="flex gap-1 mt-1">
                      <References {references} />
                    </dd>
                  </span>
                </div>
              {/if}
            {/await}

            {#if files.length > 0}
              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Files</dt>
                  <dd class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    {#each files as file}
                      {#if file.stat != null}
                        <FileViewer
                          {file}
                          readOnly={!data.userPermissions?.includes(DELETE_PERMISSION)}
                          stat={file.stat}
                          onDelete={() => {
                            files = files.filter((_file) => file.id !== _file.id)
                          }}
                        />
                      {:else if file.error != null}
                        <aside class="alert variant-filled-error">
                          <div class="alert-message">
                            <h3 class="h3">Error</h3>
                            <p>{file.error}</p>
                          </div>
                        </aside>
                      {/if}
                    {/each}
                  </dd>
                </span>
              </div>
            {/if}
          </dl>
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
