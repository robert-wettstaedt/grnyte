<!-- "Report…" as a small button in a row's own actions, or "Reported" once the caller has an open
     report on it. The caller shows it only where `canReport` holds. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { RemovableKind } from '$lib/entities/moderation/dto'
  import { m } from '$lib/paraglide/messages'
  import { reportClaim } from './dto'
  import { myOpenReport } from './resources.svelte'

  interface Props {
    id: number | string
    kind: RemovableKind
  }

  const { id, kind }: Props = $props()

  const reported = myOpenReport(
    () => kind,
    () => String(id),
  )
  const claim = $derived(reportClaim(reported.data != null, reported.phase))
</script>

<!-- Held in place, unsaid, until the caller's reports answer: "Report…" would claim none. -->
<a
  class="btn btn-sm preset-tonal-surface"
  style:visibility={claim == null ? 'hidden' : undefined}
  href={resolve('/(app)/report/[kind=removable]/[id]', { id: String(id), kind })}
>
  <Icon name="flag" fill={claim === 'reported' ? 'currentColor' : 'none'} size={13} />
  {claim === 'reported' ? m.reports_reported() : m.reports_entry()}
</a>
