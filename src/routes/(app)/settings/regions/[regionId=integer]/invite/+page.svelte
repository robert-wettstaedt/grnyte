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

{#if data.regionMembers.count >= data.region.maxMembers}
  <aside class="card preset-tonal-error my-8 p-2 whitespace-pre-line md:p-4">
    <p>
      This region has reached the maximum number of members ({data.region.maxMembers}).
    </p>
  </aside>
{/if}

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
        <input
          class="input"
          disabled={data.regionMembers.count >= data.region.maxMembers}
          name="email"
          type="email"
          placeholder="Enter email..."
          value={form?.email ?? ''}
        />
      </label>

      <div class="mt-8 flex justify-between md:items-center">
        <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
        <button
          class="btn preset-filled-primary-500"
          type="submit"
          disabled={loading || data.regionMembers.count >= data.region.maxMembers}
        >
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
