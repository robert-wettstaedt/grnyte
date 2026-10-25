<!-- "Report…" in a More sheet, or "Reported" once the caller has an open report on it. The caller
     shows it only where `canReport` holds. -->
<script lang="ts">
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import type { RemovableKind } from '$lib/entities/moderation/dto'
  import { m } from '$lib/paraglide/messages'
  import { reportFormHref } from './href'
  import { myOpenReport } from './resources.svelte'

  interface Props {
    id: number | string
    kind: RemovableKind
    onclick?: () => void
  }

  const { id, kind, onclick }: Props = $props()

  const reported = myOpenReport(
    () => kind,
    () => String(id),
  )
</script>

<MenuRow
  href={reportFormHref(kind, id)}
  icon="flag"
  label={reported.data == null ? m.reports_entry() : m.reports_reported()}
  {onclick}
/>
