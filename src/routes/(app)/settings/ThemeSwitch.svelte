<script lang="ts">
  import { browser } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'
  import SettingSelect from './SettingSelect.svelte'

  type ModePreference = 'dark' | 'light' | 'system'

  const MODE_STORAGE_KEY = 'mode'

  // `id` ties the select to the settings row's <label for>.
  const { id }: { id: string } = $props()

  let mode = $state<ModePreference>('system')

  onMount(() => {
    const persistedMode = localStorage.getItem(MODE_STORAGE_KEY)

    if (persistedMode === 'light' || persistedMode === 'dark' || persistedMode === 'system') {
      mode = persistedMode
    }
  })

  const onModeChange = (value: ModePreference) => {
    mode = value
    if (!browser) return

    localStorage.setItem(MODE_STORAGE_KEY, mode)
    // Theme application (class + theme-color meta) lives in the app.html bootstrap; it reads the
    // persisted mode, so we just persist then trigger it.
    window.__applyTheme?.()
  }
</script>

<SettingSelect
  {id}
  value={mode}
  onchange={onModeChange}
  options={[
    { label: m.theme_light(), value: 'light' },
    { label: m.theme_dark(), value: 'dark' },
    { label: m.theme_system(), value: 'system' },
  ]}
/>
