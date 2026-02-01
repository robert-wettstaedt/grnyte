<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  const { data, form } = $props()

  const { t } = $derived(getI18n())
  let loading = $state(false)
</script>

<svelte:head>
  <title>{t('settings.regionSettings.inviteToRegion')} {data.region.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if data.regionMembers.count >= data.region.maxMembers}
  <aside class="card preset-tonal-error my-8 p-2 whitespace-pre-line md:p-4">
    <p>
      {t('settings.regionSettings.maxMembersReached', { max: data.region.maxMembers })}
    </p>
  </aside>
{/if}

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('settings.regionSettings.inviteToRegion')}
      {data.region.name}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  method="post"
  use:enhance={() => {
    loading = true
    return ({ result }) => {
      loading = false
      return applyAction(result)
    }
  }}
>
  <label class="label">
    <span>{t('common.email')}</span>
    <input
      class="input"
      disabled={data.regionMembers.count >= data.region.maxMembers}
      name="email"
      type="email"
      placeholder={t('common.enterEmail')}
      value={form?.email ?? ''}
    />
  </label>

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button"
      >{t('common.cancel')}</button
    >
    <button
      class="btn preset-filled-primary-500"
      type="submit"
      disabled={loading || data.regionMembers.count >= data.region.maxMembers}
    >
      {#if loading}
        <LoadingIndicator />
      {/if}

      {t('invite.sendInvite')}
    </button>
  </div>
</form>
