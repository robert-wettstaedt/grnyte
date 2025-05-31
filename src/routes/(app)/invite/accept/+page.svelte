<script lang="ts">
  import { enhance } from '$app/forms'
  import type { PageData } from './$types'

  export let data: PageData
</script>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="app-settings">
  <header class="space-y-1">
    <h2 class="h4">Region Invitation</h2>
  </header>

  <section class="w-full space-y-5">
    <p class="mb-4">
      You have been invited to join <span class="font-semibold">{data.invitation.region.name}</span> by
      <span class="font-semibold">{data.invitation.invitedBy.username}</span>.
    </p>

    <form method="POST" action="?/accept" use:enhance>
      <input type="hidden" name="token" value={data.invitation.token} />

      <button type="submit" class="btn preset-filled-primary-500 w-full"> Accept Invitation </button>
    </form>
  </section>
</div>
