<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { AppBar, Progress } from '@skeletonlabs/skeleton-svelte'

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
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Invite to {data.region.name}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
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
          <Progress value={null}>
            <Progress.Circle class="[--size:--spacing(4)]">
              <Progress.CircleTrack />
              <Progress.CircleRange />
            </Progress.Circle>
            <Progress.ValueText />
          </Progress>
        </span>
      {/if}

      Invite
    </button>
  </div>
</form>
