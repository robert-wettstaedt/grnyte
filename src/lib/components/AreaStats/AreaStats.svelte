<script lang="ts">
  import { page } from '$app/state'
  import GradeHistogram, { type GradeHistogramProps } from '$lib/components/GradeHistogram'
  import { pageState } from '$lib/components/Layout'
  import type { Row } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import ZeroQueryWrapper from '../ZeroQueryWrapper'

  interface Props extends Partial<GradeHistogramProps> {
    areaId: number
    children?: Snippet<[Row<'routes'>[]]>
  }
  const { areaId, children: propsChildren, ...rest }: Props = $props()
</script>

<ZeroQueryWrapper
  loadingIndicator={{
    type: 'spinner',
    size: rest.opts?.height == null || rest.opts.height > 64 ? undefined : 'size-12',
  }}
  query={page.data.z.current.query.routes.where('areaIds', 'ILIKE', `%^${areaId}$%`)}
>
  {#snippet children(routes)}
    {@const stats = routes.map((route): GradeHistogramProps['data'][0] => {
      const grade = pageState.grades.find((grade) => grade.id === (route.userGradeFk ?? route.gradeFk))
      const gradeValue = grade?.[pageState.user?.userSettings?.gradingScale ?? 'FB'] ?? undefined

      return { grade: gradeValue }
    })}

    <GradeHistogram {...rest} data={stats} />

    {#if propsChildren != null}
      {@render propsChildren(routes)}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
