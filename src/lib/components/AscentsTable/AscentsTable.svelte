<script lang="ts">
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import RouteName from '$lib/components/RouteName'
  import type { EnrichedAscent } from '$lib/db/utils'
  import { convertMarkdownToHtml } from '$lib/markdown'
  import type { Pagination as PaginationType } from '$lib/pagination.server'
  import { Pagination, ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { DateTime } from 'luxon'

  type PaginationProps = Parameters<typeof Pagination>[1]

  interface Props {
    ascents: EnrichedAscent[]
    pagination: PaginationType
    paginationProps?: Partial<PaginationProps>
  }

  let { ascents, pagination, paginationProps }: Props = $props()
</script>

<div class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4">
  <div class="table-wrap">
    {#if ascents.length === 0}
      No ascents yet
    {:else}
      <table class="table">
        <thead>
          <tr>
            <th>Climber</th>
            <th>Date time</th>
            <th>Type</th>
            <th>Route</th>
          </tr>
        </thead>

        <tbody class="hover:[&>tr:not(.notes)]:preset-tonal-primary">
          {#each ascents as ascent}
            <tr class="whitespace-nowrap">
              <td>
                <a class="anchor hover:text-white" href="/users/{ascent.author.username}">{ascent.author.username}</a>
              </td>

              <td>
                {DateTime.fromSQL(ascent.dateTime).toLocaleString(DateTime.DATE_FULL)}
              </td>

              <td>
                <AscentTypeLabel includeText type={ascent.type} />
              </td>

              <td>
                <a class="anchor hover:text-white" href={ascent.route.pathname}>
                  <RouteName route={ascent.route} />
                </a>
              </td>
            </tr>

            {#if ascent.notes != null && ascent.notes.length > 0}
              <tr class="notes">
                <td colspan="4">
                  {#await convertMarkdownToHtml(ascent.notes)}
                    <ProgressRing classes="m-auto" size="size-8" value={null} />
                  {:then value}
                    {@html value}
                  {/await}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<div class="my-8 flex justify-end">
  <Pagination
    buttonClasses="btn-sm md:btn-md"
    count={pagination.total}
    data={[]}
    page={pagination.page}
    pageSize={pagination.pageSize}
    siblingCount={0}
    {...paginationProps}
  />
</div>
