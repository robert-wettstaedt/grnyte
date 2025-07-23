<script lang="ts">
  import { page } from '$app/state'
  import GradeHistogram, { type GradeHistogramProps } from '$lib/components/GradeHistogram'
  import type { Schema } from '$lib/db/zero'
  import type { PullRow } from '@rocicorp/zero'
  import type { Snippet } from 'svelte'
  import ZeroQueryWrapper from '../ZeroQueryWrapper'

  interface Props extends Partial<GradeHistogramProps> {
    areaId: number
    children?: Snippet<[PullRow<'routes', Schema>[]]>
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
      const grade = page.data.grades.find((grade) => grade.id === (route.userGradeFk ?? route.gradeFk))
      const gradeValue = grade?.[page.data.user?.userSettings?.gradingScale ?? 'FB'] ?? undefined

      return { grade: gradeValue }
    })}

    <GradeHistogram {...rest} data={stats} />

    {#if propsChildren != null}
      {@render propsChildren(routes)}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
