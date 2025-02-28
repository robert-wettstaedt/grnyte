<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'

  const { data, form } = $props()
</script>

<svelte:head>
  <title>Edit profile - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Edit profile
  {/snippet}
</AppBar>

{#if form?.success}
  <aside class="card preset-tonal-success my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{form.success}</p>
  </aside>
{/if}

{#if page.url.searchParams.get('message') != null}
  <aside class="card preset-tonal-success my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{page.url.searchParams.get('message')}</p>
  </aside>
{/if}

{#if page.url.searchParams.get('error_description') != null}
  <aside class="card preset-tonal-error my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{page.url.searchParams.get('error_description')}</p>
  </aside>
{/if}

{#if page.data.session?.user.email_confirmed_at == null}
  <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
    <p>Your email address is not confirmed. Please check your email for a confirmation link.</p>
  </aside>
{/if}

<form class="card mt-4 flex flex-col gap-4" method="post">
  <label class="label">
    <span>Email</span>

    <input
      name="email"
      type="email"
      placeholder="you@example.com"
      class="input"
      required
      value={data.authUser?.email}
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
      value={data.user?.username}
    />
  </label>

  <div class="flex justify-between mt-4">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit">Save profile</button>
  </div>
</form>
