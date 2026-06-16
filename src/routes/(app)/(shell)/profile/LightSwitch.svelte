<script lang="ts">
  import { browser } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'

  type ModePreference = 'light' | 'dark' | 'system'

  const MODE_STORAGE_KEY = 'mode'

  let mode = $state<ModePreference>('system')

  onMount(() => {
    const persistedMode = localStorage.getItem(MODE_STORAGE_KEY)

    if (persistedMode === 'light' || persistedMode === 'dark' || persistedMode === 'system') {
      mode = persistedMode
    }
  })

  const onModeChange = () => {
    if (!browser) return

    localStorage.setItem(MODE_STORAGE_KEY, mode)
    // Theme application (class + theme-color meta) lives in the app.html bootstrap; it reads the
    // persisted mode, so we just persist then trigger it.
    window.__applyTheme?.()
  }
</script>

<select aria-label={m.theme_label()} bind:value={mode} class="select w-32" name="mode" onchange={onModeChange}>
  <option value="light">{m.theme_light()}</option>
  <option value="dark">{m.theme_dark()}</option>
  <option value="system">{m.theme_system()}</option>
</select>
