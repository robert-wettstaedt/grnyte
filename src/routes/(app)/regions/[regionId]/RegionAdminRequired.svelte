<script lang="ts">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import { entityHref } from '$lib/entities/href'
  import { m } from '$lib/paraglide/messages'

  // Every admin-only region settings screen shows this, which is why it lives here and not in one of them.
  interface Props {
    description?: string
    regionId: number
  }

  const { description = m.form_noAdminPermission(), regionId }: Props = $props()
</script>

<ErrorState
  type="generic"
  title={m.form_noPermissionTitle()}
  {description}
  primaryAction={{
    href: entityHref('regions', regionId),
    label: m.region_viewRegion(),
  }}
/>
