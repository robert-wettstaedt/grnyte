<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AscentsTable from '$lib/components/AscentsTable'
  import type { PaginatedAscents } from '$lib/components/AscentsTable/load.server'
  import GenericList from '$lib/components/GenericList'
  import GradeHistogram from '$lib/components/GradeHistogram'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import RouteName from '$lib/components/RouteName'
  import type { EnrichedArea, EnrichedBlock } from '$lib/db/utils'
  import { ProgressRing, Segment, Tabs } from '@skeletonlabs/skeleton-svelte'
  import { DateTime } from 'luxon'
  import { onMount } from 'svelte'

  let { data } = $props()

  let loadedData: PaginatedAscents | null = $state(null)
  let loadError: string | null = $state(null)
  let loadOpts: Record<string, string> = $state({})

  let projectsMode: 'open' | 'finished' = $state('open')

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : data.requestedUser == null ? '#first-ascents' : '#sends'
  })
  onMount(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : data.requestedUser == null ? '#first-ascents' : '#sends'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.hash = event.value
    goto(newUrl.toString(), { replaceState: true })
  }

  const sends = data.ascents
    ?.filter((ascent) => ascent.type !== 'attempt' && ascent.type !== 'repeat')
    .map((ascent) => {
      const grade = pageState.grades.find((grade) => grade.id === (ascent.gradeFk ?? ascent.route.gradeFk))

      if (grade == null) {
        return { ...ascent, grade: undefined }
      }

      return { ...ascent, grade: grade[pageState.gradingScale] }
    })

  const loadData = async () => {
    const searchParams = new URLSearchParams(loadOpts)
    const res = await fetch(`/api/users/${page.params.name}/ascents?${searchParams.toString()}`)

    if (res.status != 200) {
      loadError = 'Unable to load ascents'
      return
    }

    const data = await res.json()
    loadedData = data
  }

  onMount(() => {
    loadData()
  })
</script>

<svelte:head>
  <title>Profile of {data.requestedUser?.username ?? data.firstAscensionist?.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar hasActions={page.data.session?.user?.id === data.requestedUser?.authUserFk}>
  {#snippet lead()}
    {data.requestedUser?.username ?? data.firstAscensionist?.name}
  {/snippet}

  {#snippet actions()}
    {#if page.data.session?.user?.id === data.requestedUser?.authUserFk}
      <a class="btn btn-sm preset-outlined-primary-500" href="/profile/edit">
        <i class="fa-solid fa-pen w-4"></i>Edit profile
      </a>

      <a class="btn btn-sm preset-outlined-primary-500" href="/profile/change-password">
        <i class="fa-solid fa-key w-4"></i>Change password
      </a>
    {/if}
  {/snippet}
</AppBar>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  <Tabs
    fluid
    listClasses="overflow-x-auto overflow-y-hidden pb-[1px]"
    listGap="0"
    onValueChange={onChangeTab}
    value={tabValue}
  >
    {#snippet list()}
      {#if data.requestedUser != null}
        <Tabs.Control value="#sends">Ascents</Tabs.Control>
        <Tabs.Control value="#projects">Projects</Tabs.Control>
      {/if}
      <Tabs.Control value="#first-ascents">First ascents</Tabs.Control>
    {/snippet}

    {#snippet content()}
      {#if data.requestedUser != null}
        <Tabs.Panel value="#sends">
          <GradeHistogram
            data={sends ?? []}
            spec={{
              width: 'container' as any,
              mark: {
                type: 'bar',
                stroke: 'white',
                cursor: 'pointer',
              },
              params: [
                {
                  name: 'highlight',
                  select: { type: 'point', on: 'pointerover' },
                },
                { name: 'select', select: 'point' },
              ],
              encoding: {
                fillOpacity: {
                  condition: { param: 'select', value: 1 },
                  value: 0.3,
                },
                strokeWidth: {
                  condition: [
                    {
                      param: 'select',
                      empty: false,
                      value: 2,
                    },
                    {
                      param: 'highlight',
                      empty: false,
                      value: 1,
                    },
                  ],
                  value: 0,
                },
              },
            }}
            onEmbed={(result) => {
              result.view.addSignalListener('chartClick', (_, datum) => {
                const grade = pageState.grades.find((grade) => grade.FB === datum?.grade || grade.V === datum?.grade)

                loadOpts = grade == null ? {} : { grade: String(grade.id) }
                loadData()
              })
            }}
            opts={{
              patch: (spec) => {
                spec.signals?.push({
                  name: 'chartClick',
                  value: 0,
                  on: [{ events: '*:mousedown', update: 'datum' }],
                })

                return spec
              },
            }}
          />

          {#if loadError != null}
            <aside class="card preset-tonal-warning mt-8 p-2 whitespace-pre-line md:p-4">
              <p>{loadError}</p>
            </aside>
          {:else if loadedData == null}
            <div class="mt-16 flex justify-center">
              <ProgressRing value={null} />
            </div>
          {:else}
            <AscentsTable
              ascents={loadedData.ascents}
              pagination={loadedData.pagination}
              paginationProps={{
                onPageChange: (detail) => {
                  loadOpts = { ...loadOpts, page: String(detail.page) }
                  loadData()
                },
              }}
            />
          {/if}
        </Tabs.Panel>

        <Tabs.Panel value="#projects">
          <Segment
            name="projectsMode"
            onValueChange={(event) => (projectsMode = (event.value as 'open' | 'finished' | null) ?? 'open')}
            value={projectsMode}
          >
            <Segment.Item value="open">Open projects</Segment.Item>
            <Segment.Item value="finished">Finished projects</Segment.Item>
          </Segment>

          <GenericList
            classes="mt-4"
            items={(projectsMode === 'finished' ? data.finishedProjects : data.openProjects).map((item) => ({
              ...item,
              id: item.route.id,
              name: item.route.name,
              pathname: item.route.pathname,
            }))}
            leftClasses=""
          >
            {#snippet left(item)}
              <dt>
                <RouteName route={item.route} />
              </dt>

              <dd class="text-sm opacity-50">Sessions: {item.ascents.length}</dd>
              <dd class="text-sm opacity-50">
                Last session: {DateTime.fromSQL(item.ascents[0].dateTime).toLocaleString(DateTime.DATE_FULL)}
              </dd>
            {/snippet}

            {#snippet right(item)}
              <ol class="flex w-auto items-center gap-2 p-2">
                <li>
                  <a class="anchor" href={(item.route.block.area as EnrichedArea).pathname}>
                    {item.route.block.area.name}
                  </a>
                </li>

                <li class="opacity-50" aria-hidden={true}>&rsaquo;</li>

                <li>
                  <a class="anchor" href={(item.route.block as EnrichedBlock).pathname}>
                    {item.route.block.name}
                  </a>
                </li>
              </ol>
            {/snippet}
          </GenericList>
        </Tabs.Panel>
      {/if}

      <Tabs.Panel value="#first-ascents">
        <GenericList items={data.firstAscentRoutes ?? []}>
          {#snippet left(item)}
            <dt>
              <RouteName route={item} />
            </dt>
          {/snippet}

          {#snippet right(item)}
            <ol class="flex w-auto items-center gap-2 p-2">
              <li>
                <a class="anchor" href={(item.block.area as EnrichedArea).pathname}>
                  {item.block.area.name}
                </a>
              </li>

              <li class="opacity-50" aria-hidden={true}>&rsaquo;</li>

              <li>
                <a class="anchor" href={(item.block as EnrichedBlock).pathname}>
                  {item.block.name}
                </a>
              </li>
            </ol>
          {/snippet}
        </GenericList>
      </Tabs.Panel>
    {/snippet}
  </Tabs>
</div>
