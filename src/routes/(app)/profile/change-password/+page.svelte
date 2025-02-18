<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'

  let { form } = $props()
</script>

<svelte:head>
  <title>Change password - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Change password
  {/snippet}
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 md:p-4 whitespace-pre-line">
    <p>Your password has been changed successfully.</p>
  </aside>
{/if}

<form class="card mt-4 flex flex-col gap-4" method="post">
  <label class="label">
    <span>Current password</span>
    <input name="currentPassword" type="password" placeholder="Enter your current password" class="input" required />
  </label>

  <label class="label">
    <span>New password</span>
    <input name="password" type="password" placeholder="Enter your new password" class="input" required />
  </label>

  <label class="label">
    <span>New password confirmation</span>
    <input name="passwordConfirmation" type="password" placeholder="Enter your new password" class="input" required />
  </label>

  <div class="flex justify-between mt-4">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit">Save password</button>
  </div>
</form>
