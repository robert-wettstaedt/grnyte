<script lang="ts">
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'

  let { form } = $props()

  const error = $derived.by(() => {
    const errorDescription = $page.url.searchParams.get('error_description')
    if (errorDescription != null) {
      return errorDescription
    }

    const code = $page.url.searchParams.get('code')
    if (code == null) {
      return 'Invalid or expired token'
    }
  })
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
  <aside class="card preset-tonal-success my-8 p-2 md:p-4 whitespace-pre-line">
    <p>Your password has been changed successfully.</p>
  </aside>
{/if}

{#if error == null}
  <form class="card mt-4 flex flex-col gap-4" method="post">
    <label class="label">
      <span>Enter your email</span>
      <input class="input" name="email" placeholder="you@example.com" required type="email" />
    </label>

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

    <div class="flex justify-between mt-4">
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
      <button class="btn preset-filled-primary-500" type="submit">Save password</button>
    </div>
  </form>
{:else}
  <aside class="card preset-tonal-error my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{error}</p>
  </aside>
{/if}
