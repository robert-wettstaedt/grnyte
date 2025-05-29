<script lang="ts">
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'

  const { data, form } = $props()
</script>

<svelte:window />

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if data.session == null}
  <!-- Hero Section -->
  <section class="relative flex min-h-[calc(100vh-1rem-48px)] items-center md:min-h-[calc(100vh-2rem-48px)]">
    <div class="absolute inset-[-0.5rem] -z-10 overflow-hidden blur-sm brightness-50 md:inset-[-1rem]">
      <video class="min-h-full min-w-full object-cover" autoplay loop muted>
        <source
          src="https://niniugtqbfituyzfoapv.supabase.co/storage/v1/object/public/crag-track/20241222_1354_Mossy%20Forest%20Boulder_storyboard_01jfq6xey9esm8kpfzwfpc09xn.mp4?t=2025-01-01T12%3A18%3A56.818Z"
          type="video/mp4"
        />
        Your browser does not support the video tag.
      </video>
    </div>

    <div class="container mx-auto px-4 text-center">
      <h1 class="h1 mb-4">Secure boulder topo and session tracker</h1>

      <p class="mx-auto mb-8 max-w-2xl text-xl opacity-75">
        Document your ascents, manage topos, and connect with the climbing community. All in one place.
      </p>

      <div class="flex justify-center gap-4">
        <a href="/auth" class="btn preset-filled-primary-500">
          <i class="fa-solid fa-right-to-bracket mr-2"></i>
          Start Climbing
        </a>
      </div>
    </div>
  </section>

  <!-- Features Grid -->
  <section class="grid gap-8 py-16 md:grid-cols-3">
    <div class="card preset-filled-surface-100-900 p-6">
      <i class="fa-solid fa-mountain text-primary-500 mb-4 text-4xl"></i>
      <h2 class="h3 mb-2">Topo Management</h2>
      <p class="opacity-75">Organize climbing areas, sectors, and routes with detailed information and topos.</p>
    </div>

    <div class="card preset-filled-surface-100-900 p-6">
      <i class="fa-solid fa-chart-line text-primary-500 mb-4 text-4xl"></i>
      <h2 class="h3 mb-2">Progress Tracking</h2>
      <p class="opacity-75">Log your ascents, track projects, and visualize your climbing progression.</p>
    </div>

    <div class="card preset-filled-surface-100-900 p-6">
      <i class="fa-solid fa-users text-primary-500 mb-4 text-4xl"></i>
      <h2 class="h3 mb-2">Community</h2>
      <p class="opacity-75">Connect with other climbers, share beta, and discover new climbing spots.</p>
    </div>
  </section>

  <!-- Integration Section -->
  <section class="py-16 text-center">
    <h2 class="h2 mb-8">Integrates with Your Favorite Platforms</h2>
    <div class="flex items-center justify-center gap-8">
      <img src={Logo8a} alt="8a" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
      <img src={Logo27crags} alt="27crags" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
      <img src={LogoTheCrag} alt="The Crag" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
    </div>
  </section>
{:else if data.userRegions.length > 0}
  <div class="-m-[0.5rem] md:-m-[1rem]" use:fitHeightAction={{ paddingBottom: 0 }}>
    {#await import('$lib/components/BlocksMap') then BlocksMap}
      <BlocksMap.default />
    {/await}
  </div>
{:else}
  <div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-md p-6">
    <h2 class="h3 mb-4 text-center">Thank you for signing up for {PUBLIC_APPLICATION_NAME}</h2>

    <p class="mb-4 text-center opacity-75">
      You are not currently a member of any regions. You need to be invited by a region admin to join a region.
    </p>

    <p class="mb-4 text-center opacity-75">Or you can create a new region here:</p>

    <form action="?/createRegion" class="flex items-end" method="post" use:enhance>
      <label class="label">
        <span>Region name</span>
        <input
          class="input h-[34px] rounded-tr-none rounded-br-none"
          name="name"
          placeholder="Enter name..."
          type="text"
          value={form?.name ?? ''}
        />
      </label>

      <button
        aria-label="Create region"
        class="btn-icon preset-filled-primary-500 h-[18px] rounded-tl-none rounded-bl-none"
        type="submit"
      >
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </form>

    {#if PUBLIC_TOPO_EMAIL}
      <p class="mt-6 text-center opacity-75">
        If you need support or want to be invited to an existing region, please reach out to us at
        <a class="anchor" href="mailto:{PUBLIC_TOPO_EMAIL}">{PUBLIC_TOPO_EMAIL}</a>.
      </p>
    {/if}
  </div>
{/if}
