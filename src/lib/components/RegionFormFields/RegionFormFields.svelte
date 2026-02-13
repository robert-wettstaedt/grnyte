<script lang="ts">
  import JsonEditor from '$lib/components/JSONEditor'
  import type { Region } from '$lib/db/schema'
  import { regionSettingsSchema } from '$lib/forms/schemas'
  import { getI18n } from '$lib/i18n'

  interface Props {
    onChange?: (isValid: boolean) => void
    name: Region['name']
    settings: Region['settings'] | string
  }

  let { onChange, name, settings }: Props = $props()

  const { t } = getI18n()
  let settingsString = $derived(JSON.stringify(settings))
</script>

<label class="label">
  <span>{t('common.name')}</span>
  <input class="input" name="name" type="text" placeholder={t('common.enterName')} value={name} />
</label>

<label class="label mt-4">
  <span>{t('common.settings')}</span>
  <input name="settings" type="hidden" value={settingsString} />
</label>

<JsonEditor {onChange} schema={regionSettingsSchema} bind:value={settings} />
