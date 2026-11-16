<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import SettingLink from './SettingLink.svelte'

  const { Story } = defineMeta({
    args: { href: '#', label: 'Username', value: 'ana' },
    component: SettingLink,
    title: 'Settings/SettingLink',
  })
</script>

<Story name="Link" />

<!-- The sign-in methods screen's Password row: a status line under the label. -->
<Story name="With description" args={{ description: 'Not set', label: 'Password', value: 'Set a password' }} />

<Story name="Read-only" args={{ href: undefined }} />
