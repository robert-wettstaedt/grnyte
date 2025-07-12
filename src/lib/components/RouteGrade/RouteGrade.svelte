<script lang="ts">
  import { page } from '$app/state'
  import type { RowWithRelations, Schema } from '$lib/db/zero'
  import CorrectedGrade from './components/CorrectedGrade'

  interface Props {
    route: RowWithRelations<Schema, 'routes', { ascents: true }>
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
