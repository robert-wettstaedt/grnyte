<script lang="ts">
  import { browser } from '$app/environment'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'

  type ModePreference = 'light' | 'dark' | 'system'

  const MODE_STORAGE_KEY = 'mode'
  const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

  let mode = $state<ModePreference>('system')
  let systemModeQuery: MediaQueryList | undefined

  const getSystemMode = (): 'light' | 'dark' => (globalThis.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light')

  const applyMode = (value: ModePreference) => {
    if (!browser) return

    const resolvedMode = value === 'system' ? getSystemMode() : value
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolvedMode)
  }

  const onSystemModeChange = () => {
    if (mode !== 'system') return
    applyMode('system')
  }

  onMount(() => {
    const persistedMode = localStorage.getItem(MODE_STORAGE_KEY)

    if (persistedMode === 'light' || persistedMode === 'dark' || persistedMode === 'system') {
      mode = persistedMode
    } else {
      mode = 'system'
    }

    applyMode(mode)

    systemModeQuery = globalThis.matchMedia(SYSTEM_DARK_QUERY)
    systemModeQuery.addEventListener('change', onSystemModeChange)

    return () => {
      systemModeQuery?.removeEventListener('change', onSystemModeChange)
    }
  })

  const onModeChange = () => {
    if (!browser) return

    localStorage.setItem(MODE_STORAGE_KEY, mode)
    applyMode(mode)
  }
</script>

<select aria-label={m.theme_label()} bind:value={mode} class="select w-32" name="mode" onchange={onModeChange}>
  <option value="light">{m.theme_light()}</option>
  <option value="dark">{m.theme_dark()}</option>
  <option value="system">{m.theme_system()}</option>
</select>
