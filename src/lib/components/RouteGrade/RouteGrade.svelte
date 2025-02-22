<script lang="ts">
  import { page } from '$app/stores'
  import type { InferResultType } from '$lib/db/types'
  import CorrectedGrade from './components/CorrectedGrade'

  type RouteWithAscents = InferResultType<'routes', { ascents: true }>

  interface Props {
    gradeFk?: number | null
    route: Partial<Pick<RouteWithAscents, 'ascents' | 'gradeFk' | 'userGradeFk'>> | undefined
  }

  let { gradeFk, route }: Props = $props()

  const send = $derived(
    route?.ascents
      ?.filter((ascent) => String(ascent.createdBy) === String($page.data.user!.id))
      .find((ascent) => ascent.type === 'send'),
  )
</script>

{#if (gradeFk ?? route?.userGradeFk ?? route?.gradeFk ?? send?.gradeFk) != null}
  <CorrectedGrade oldGrade={route?.userGradeFk ?? route?.gradeFk} newGrade={gradeFk ?? send?.gradeFk} />
{/if}
