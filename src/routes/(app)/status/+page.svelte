<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import { getBunnyStatus, getNextcloudStatus, getSupabaseStatus, getZeroStatus } from './page.remote'
  import Status from './Status.svelte'

  const { t } = $derived(getI18n())
</script>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4">
  <header class="space-y-1">
    <h2 class="h4">{t('status.title')}</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li class="flex justify-between p-2">
        <span>{t('status.services.zero')}</span>
        <Status query={getZeroStatus} />
      </li>

      <li class="border-surface-800 flex justify-between border-t p-2">
        <span>{t('status.services.supabase')}</span>
        <Status query={getSupabaseStatus} />
      </li>

      <li class="border-surface-800 flex justify-between border-t p-2">
        <span>{t('status.services.nextcloud')}</span>
        <Status query={getNextcloudStatus} />
      </li>

      <li class="border-surface-800 flex justify-between border-t p-2">
        <span>{t('status.services.bunny')}</span>
        <Status query={getBunnyStatus} />
      </li>
    </ul>
  </section>
</div>
