<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ReauthStep from './ReauthStep.svelte'

  // Remote functions are stubbed in Storybook, so the peek fails and the step settles unconfirmed;
  // the code field and the confirmed state need the app (or the component tests).
  const { Story } = defineMeta({
    args: { action: 'region.delete', target: '1' },
    component: ReauthStep,
    title: 'Auth/ReauthStep',
  })
</script>

<!-- Nothing confirmed yet: "Send code", nothing mailed. -->
<Story name="Not confirmed" />

<!-- The screen is still deciding: the reserved skeleton. -->
<Story name="Waiting for the screen" args={{ ready: false }} />

<!-- Account deletion with a blocking region: one line, no "Send code". -->
<Story name="Blocked" args={{ action: 'account.delete', blocked: true }} />
