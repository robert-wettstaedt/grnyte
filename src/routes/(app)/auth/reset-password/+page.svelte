<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'

  let { form } = $props()

  const error = $derived(page.url.searchParams.get('error_description'))
</script>

<svelte:head>
  <title>Reset password - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Reset password
  {/snippet}
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>Your password has been changed successfully.</p>
  </aside>
{/if}

{#if error == null}
  <form class="card mt-4 flex flex-col gap-4" method="post" use:enhance>
    <label class="label">
      <span>New password</span>
      <input name="password" type="password" placeholder="Enter your new password" class="input" required />
    </label>

    <label class="label">
      <span>New password confirmation</span>
      <input
        name="passwordConfirmation"
        type="password"
        placeholder="Confirm your new password"
        class="input"
        required
      />
    </label>

    <div class="mt-4 flex justify-between">
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
      <button class="btn preset-filled-primary-500" type="submit">Save password</button>
    </div>
  </form>
{:else}
  <aside class="card preset-tonal-error my-8 p-2 whitespace-pre-line md:p-4">
    <p>{error}</p>
  </aside>
{/if}
