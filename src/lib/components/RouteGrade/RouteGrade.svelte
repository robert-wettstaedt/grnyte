<script lang="ts">
  import { page } from '$app/state'
  import type { Row } from '$lib/db/zero'
  import CorrectedGrade from './components/CorrectedGrade'

  interface Props {
    ascents: Row<'ascents'>[]
    route: Row<'routes'>
  }

  let { ascents, route }: Props = $props()

  const send = $derived(
    ascents
      ?.filter((ascent) => String(ascent.createdBy) === String(page.data.user!.id))
      .find((ascent) => ascent.type === 'send'),
  )
</script>

{#if (route?.userGradeFk ?? route?.gradeFk ?? send?.gradeFk) != null}
  <CorrectedGrade oldGrade={route?.userGradeFk ?? route?.gradeFk} newGrade={send?.gradeFk} />
{/if}
