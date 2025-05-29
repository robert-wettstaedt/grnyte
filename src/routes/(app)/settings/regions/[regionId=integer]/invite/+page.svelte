<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar/AppBar.svelte'

  const { data, form } = $props()
  let baseUrl = $derived(`/settings/regions/${data.region.id}`)
</script>

<svelte:head>
  <title>Invite to {data.region.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Invite to {data.region.name}
  {/snippet}

  {#snippet headline()}
    <form method="post" use:enhance>
      <label class="label">
        <span>Email</span>
        <input class="input" name="email" type="email" placeholder="Enter email..." value={form?.email ?? ''} />
      </label>

      <button class="btn preset-filled-primary-500 mt-4" type="submit">Invite</button>
    </form>
  {/snippet}
</AppBar>
