<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { pageState } from '$lib/components/Layout/page.svelte.js'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  const { data, form } = $props()
</script>

<svelte:head>
  <title>Edit profile - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>Edit profile</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>{form.success}</p>
  </aside>
{/if}

{#if page.url.searchParams.get('message') != null}
  <aside class="card preset-tonal-success my-8 p-2 whitespace-pre-line md:p-4">
    <p>{page.url.searchParams.get('message')}</p>
  </aside>
{/if}

{#if page.url.searchParams.get('error_description') != null}
  <aside class="card preset-tonal-error my-8 p-2 whitespace-pre-line md:p-4">
    <p>{page.url.searchParams.get('error_description')}</p>
  </aside>
{/if}

{#if page.data.session?.user.email_confirmed_at == null}
  <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
    <p>Your email address is not confirmed. Please check your email for a confirmation link.</p>
  </aside>
{/if}

<form class="card mt-4 flex flex-col gap-4" method="post" use:enhance>
  <label class="label">
    <span>Email</span>

    <input
      name="email"
      type="email"
      placeholder="you@example.com"
      class="input"
      required
      value={data.session?.user.email}
    />
  </label>

  <label class="label">
    <span>Username</span>
    <input
      name="username"
      type="text"
      class="input"
      placeholder="Enter your username"
      required
      value={pageState.user?.username}
    />
  </label>

  <div class="mt-4 flex justify-between">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit">Save profile</button>
  </div>
</form>
