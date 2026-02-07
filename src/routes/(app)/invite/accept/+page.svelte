<script lang="ts">
  import { enhance } from '$app/forms'
  import { getI18n } from '$lib/i18n'

  const { data } = $props()

  const { t } = $derived(getI18n())
</script>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="app-settings">
  <header class="space-y-1">
    <h2 class="h4">{t('invite.title')}</h2>
  </header>

  <section class="w-full space-y-5">
    <p class="mb-4">
      {t('invite.invitedToJoin')} <span class="font-semibold">{data.invitation.region.name}</span>
      {t('invite.by')}
      <span class="font-semibold">{data.invitation.invitedBy.username}</span>.
    </p>

    <form method="POST" action="?/accept" use:enhance>
      <input type="hidden" name="token" value={data.invitation.token} />

      <button type="submit" class="btn preset-filled-primary-500 w-full">{t('invite.accept')}</button>
    </form>
  </section>
</div>
