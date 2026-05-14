<script lang="ts">
  import GradeHistogram, { type GradeHistogramProps } from '$lib/components/GradeHistogram'
  import { pageState } from '$lib/components/Layout'
  import { queries, type Row } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import ZeroQueryWrapper from '../ZeroQueryWrapper'

  interface Props extends Partial<GradeHistogramProps> {
    areaId: number
    children?: Snippet<[Row<'routes'>[]]>
    skeletonHeight?: string
  }
  const { areaId, children: propsChildren, skeletonHeight, ...rest }: Props = $props()
</script>

<ZeroQueryWrapper
  loadingIndicator={{ count: 1, height: skeletonHeight, type: 'skeleton' }}
  query={queries.listRoutes({ areaId })}
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
