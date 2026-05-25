<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import Dialog from '$lib/components/Dialog'
  import { pageState } from '$lib/components/Layout'
  import { getParkingContext } from '$lib/contexts/parking'
  import { getNavigationUrl } from '$lib/features'
  import { enhance } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { Action, ActionBar } from '../../ActionBar'
  import { deleteGeolocation } from './page.remote'

  const { geolocation } = getParkingContext()
  const { t } = getI18n()

  let deleteOpen = $state(false)
</script>

<ActionBar>
  <Action href={getNavigationUrl(geolocation.lat, geolocation.long)}>
    <i class="fa-solid fa-diamond-turn-right"></i>
    {t('map.directions')}
  </Action>

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], geolocation.regionFk)}
    <Action class="preset-filled-error-500!" onclick={() => (deleteOpen = true)}>
      <i class="fa-solid fa-trash"></i>
      {t('dangerZone.delete', { name: t('parking.location') })}
    </Action>

    <Dialog
      open={deleteOpen}
      onOpenChange={(event) => (deleteOpen = event.open)}
      onsave={() => enhance(() => deleteGeolocation(geolocation.id))}
      pending={deleteGeolocation.pending}
      saveText={t('common.delete')}
      title={t('dangerZone.delete', { name: t('parking.location') })}
    >
      {#snippet content()}
        <p>{t('dangerZone.confirmDelete', { name: t('parking.location') })}</p>
        <p>{t('dangerZone.cannotUndo')}</p>
      {/snippet}
    </Dialog>
  {/if}
</ActionBar>
