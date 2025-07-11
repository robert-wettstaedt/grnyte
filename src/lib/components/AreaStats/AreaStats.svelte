<script lang="ts">
  import { page } from '$app/state'
  import GradeHistogram, { type GradeHistogramProps } from '$lib/components/GradeHistogram'
  import type { Route } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import { Query } from 'zero-svelte'

  interface Props extends Partial<GradeHistogramProps> {
    areaId: number
    children?: Snippet<[Route[]]>
  }
  const { areaId, children, ...rest }: Props = $props()

  const { current: routes, details } = $derived(
    new Query(page.data.z.current.query.routes.where('areaIds', 'ILIKE', `%^${areaId}$%`)),
  )

  const stats = $derived(
    routes.map((route): GradeHistogramProps['data'][0] => {
      const grade = page.data.grades.find((grade) => grade.id === (route.userGradeFk ?? route.gradeFk))
      const gradeValue = grade?.[page.data.user?.userSettings?.gradingScale ?? 'FB'] ?? undefined

      return { grade: gradeValue }
    }),
  )
</script>

{#if routes.length === 0 && details.type !== 'complete'}
  <ProgressRing size={rest.opts?.height == null || rest.opts.height > 64 ? undefined : 'size-12'} value={null} />
{:else}
  <GradeHistogram {...rest} data={stats ?? []} />

  {#if children != null}
    {@render children(routes)}
  {/if}
{/if}
