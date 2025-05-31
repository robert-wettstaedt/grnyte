<script lang="ts">
  import JsonEditor from '$lib/components/JSONEditor'
  import type { Region } from '$lib/db/schema'
  import { regionSettingsSchema } from '$lib/forms/schemas'

  interface Props {
    onChange?: (isValid: boolean) => void
    name: Region['name']
    settings: Region['settings'] | string
  }

  let { onChange, name, settings }: Props = $props()

  let settingsString = $derived(JSON.stringify(settings))
</script>

<label class="label">
  <span>Name</span>
  <input class="input" name="name" type="text" placeholder="Enter name..." value={name} />
</label>

<label class="label mt-4">
  <span>Settings</span>
  <input name="settings" type="hidden" value={settingsString} />
</label>

<JsonEditor {onChange} schema={regionSettingsSchema} bind:value={settings} />
