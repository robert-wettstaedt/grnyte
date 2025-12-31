<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  let { form } = $props()
</script>

<svelte:head>
  <title>Change password - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>Change password</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>Your password has been changed successfully.</p>
  </aside>
{/if}

<form class="card mt-4 flex flex-col gap-4" method="post" use:enhance>
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
    <input name="passwordConfirmation" type="password" placeholder="Confirm your new password" class="input" required />
  </label>

  <div class="mt-4 flex justify-between">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit">Save password</button>
  </div>
</form>
