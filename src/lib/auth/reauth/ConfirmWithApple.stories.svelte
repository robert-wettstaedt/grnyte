<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ConfirmWithApple from './ConfirmWithApple.svelte'

  const { Story } = defineMeta({
    args: { action: 'region.delete', returnTo: '/regions/1/delete', target: '1' },
    component: ConfirmWithApple,
    title: 'Auth/ConfirmWithApple',
  })
</script>

<Story name="Filled" args={{ action: 'account.delete', target: 'self' }} />

<Story name="Plain" />
