<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ReauthStep from './ReauthStep.svelte'

  // Remote functions are stubbed in Storybook, so the peek fails and the step settles unconfirmed;
  // the code field and the confirmed state need the app (or the component tests).
  const { Story } = defineMeta({
    args: { action: 'region.delete', email: 'sam@posteo.de', target: '1' },
    component: ReauthStep,
    title: 'Auth/ReauthStep',
  })
</script>

<Story name="Not confirmed" />

<Story name="Waiting for the screen" args={{ ready: false }} />
