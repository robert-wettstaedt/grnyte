<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar/AppBar.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  const { data, form } = $props()

  let loading = $state(false)
</script>

<svelte:head>
  <title>Invite to {data.region.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Invite to {data.region.name}
  {/snippet}

  {#snippet headline()}
    <form
      method="post"
      use:enhance={() => {
        loading = true
        return ({ result }) => {
          loading = false
          return applyAction(result)
        }
      }}
    >
      <label class="label">
        <span>Email</span>
        <input class="input" name="email" type="email" placeholder="Enter email..." value={form?.email ?? ''} />
      </label>

      <div class="mt-8 flex justify-between md:items-center">
        <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
        <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
          {#if loading}
            <span class="me-2">
              <ProgressRing size="size-4" value={null} />
            </span>
          {/if}

          Invite
        </button>
      </div>
    </form>
  {/snippet}
</AppBar>
