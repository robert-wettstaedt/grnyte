<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import { getI18n } from '$lib/i18n'

  interface Props {
    value: string | undefined | null
  }

  let { value = $bindable() }: Props = $props()

  let modalOpen = $state(false)

  const { t } = getI18n()
</script>

<label class="label mt-4">
  <span>
    {t('common.name')}

    <Dialog
      open={modalOpen}
      onOpenChange={(event) => (modalOpen = event.open)}
      title={t('routes.namingGuidelines.title')}
    >
      {#snippet trigger()}<i class="sl-2 fa-regular fa-circle-question"></i>{/snippet}

      {#snippet content()}
        <p class="font-semibold">{t('routes.namingGuidelines.intro')}</p>

        <ul class="mt-4 list-inside list-disc space-y-2">
          <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
          <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
          <li>{t('routes.namingGuidelines.items.respectfulInclusive')}</li>
          <li>{t('routes.namingGuidelines.items.ageAppropriate')}</li>
          <li>{t('routes.namingGuidelines.items.respectLocalCultures')}</li>
          <li>{t('routes.namingGuidelines.items.considerNamingThemes')}</li>
          <li>{t('routes.namingGuidelines.items.ensureUniqueWithinArea')}</li>
          <li>{t('routes.namingGuidelines.items.appropriateForPublicDisplay')}</li>
        </ul>

        <p class="mt-4 italic">{t('routes.namingGuidelines.reminder')}</p>
      {/snippet}
    </Dialog>
  </span>

  <input bind:value class="input" name="name" type="text" placeholder={t('routes.leaveEmptyIfUnknown')} />
</label>
