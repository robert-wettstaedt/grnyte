<script lang="ts">
  import { resolve } from '$app/paths'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import { m } from '$lib/paraglide/messages'

  // Every admin-only region settings screen shows this, which is why it lives here and not in one of them.
  interface Props {
    regionId: number
  }

  const { regionId }: Props = $props()
</script>

<ErrorState
  type="generic"
  title={m.form_noPermissionTitle()}
  description={m.form_noAdminPermission()}
  primaryAction={{
    href: resolve('/(app)/settings/regions/[regionId]', { regionId: String(regionId) }),
    label: m.region_viewRegion(),
  }}
/>
