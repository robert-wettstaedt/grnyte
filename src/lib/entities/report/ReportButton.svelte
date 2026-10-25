<!-- "Report…" as a small button in a row's own actions, or "Reported" once the caller has an open
     report on it. The caller shows it only where `canReport` holds. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { RemovableKind } from '$lib/entities/moderation/dto'
  import { m } from '$lib/paraglide/messages'
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
</script>

<a
  class="btn btn-sm preset-tonal-surface"
  href={resolve('/(app)/report/[kind=removable]/[id]', { id: String(id), kind })}
>
  <Icon name="flag" fill={reported.data == null ? 'none' : 'currentColor'} size={13} />
  {reported.data == null ? m.reports_entry() : m.reports_reported()}
</a>
