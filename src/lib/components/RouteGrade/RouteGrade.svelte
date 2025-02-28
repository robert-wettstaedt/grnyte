<script lang="ts">
  import { page } from '$app/state'
  import type { InferResultType } from '$lib/db/types'
  import CorrectedGrade from './components/CorrectedGrade'

  type RouteWithAscents = InferResultType<'routes', { ascents: true }>

  interface Props {
    route: Partial<Pick<RouteWithAscents, 'ascents' | 'gradeFk' | 'userGradeFk'>> | undefined
  }

  let { route }: Props = $props()

  const send = $derived(
    route?.ascents
      ?.filter((ascent) => String(ascent.createdBy) === String(page.data.user!.id))
      .find((ascent) => ascent.type === 'send'),
  )
</script>

{#if (route?.userGradeFk ?? route?.gradeFk ?? send?.gradeFk) != null}
  <CorrectedGrade oldGrade={route?.userGradeFk ?? route?.gradeFk} newGrade={send?.gradeFk} />
{/if}
