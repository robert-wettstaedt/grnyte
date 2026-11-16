<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ConfirmWithApple from './ConfirmWithApple.svelte'

  // Pressing it leaves for Apple; the stories show the two looks only.
  const { Story } = defineMeta({
    args: { action: 'region.delete', returnTo: '/regions/1/delete', target: '1' },
    component: ConfirmWithApple,
    title: 'Auth/ConfirmWithApple',
  })
</script>

<!-- Account deletion and removing Apple: filled, with the revocation caption. -->
<Story name="Filled" args={{ action: 'account.delete', target: 'self', variant: 'filled' }} />

<!-- Every other re-auth screen: Apple's outlined variant. -->
<Story name="Plain" />
