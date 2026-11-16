<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import CodeEntryFixture from './CodeEntryFixture.svelte'

  // Through the fixture: CodeEntry takes a store field, which only a mounted component can make.
  const noop = async () => {}
  const now = Date.now()

  const { Story } = defineMeta({
    args: {
      expiresAt: now + 10 * 60_000,
      label: 'Code',
      length: 8,
      onformsubmit: () => {},
      onresend: noop,
      onsubmit: noop,
      sentAt: now,
    },
    component: CodeEntryFixture,
    title: 'Auth/CodeEntry',
  })
</script>

<!-- GoTrue's 8-digit code, the countdown running. -->
<Story name="Eight digits" />

<!-- grnyte's own re-auth code. -->
<Story name="Six digits" args={{ length: 6 }} />

<!-- Past its 10 minutes: the expired line and Resend. -->
<Story name="Expired" args={{ expiresAt: now - 1000, sentAt: now - 11 * 60_000 }} />

<!-- A wrong code: the error under the field, the digits selected. -->
<Story
  name="Wrong code"
  args={{
    onsubmit: async () => {
      throw { body: { message: JSON.stringify({ message: 'auth_codeWrong' }) } }
    },
  }}
/>
