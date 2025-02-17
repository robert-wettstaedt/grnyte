<script lang="ts">
  import { PUBLIC_APPLICATION_NAME, PUBLIC_TOPO_EMAIL } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'

  const { data } = $props()
</script>

<svelte:window />

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if data.authUser == null}
  <!-- Hero Section -->
  <section class="relative flex items-center min-h-[calc(100vh-1rem-64px)] md:min-h-[calc(100vh-2rem-64px)]">
    <div class="absolute inset-[-0.5rem] md:inset-[-1rem] overflow-hidden -z-10 brightness-50 blur-sm">
      <video class="min-w-full min-h-full object-cover" autoplay loop muted>
        <source
          src="https://niniugtqbfituyzfoapv.supabase.co/storage/v1/object/public/crag-track/20241222_1354_Mossy%20Forest%20Boulder_storyboard_01jfq6xey9esm8kpfzwfpc09xn.mp4?t=2025-01-01T12%3A18%3A56.818Z"
          type="video/mp4"
        />
        Your browser does not support the video tag.
      </video>
    </div>

    <div class="container mx-auto px-4 text-center">
      <h1 class="h1 mb-4">Secure boulder topo and session tracker</h1>

      <p class="text-xl opacity-75 max-w-2xl mx-auto mb-8">
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
  <section class="grid md:grid-cols-3 gap-8 py-16">
    <div class="card p-6 preset-filled-surface-100-900">
      <i class="fa-solid fa-mountain text-4xl text-primary-500 mb-4"></i>
      <h2 class="h3 mb-2">Topo Management</h2>
      <p class="opacity-75">Organize climbing areas, sectors, and routes with detailed information and topos.</p>
    </div>

    <div class="card p-6 preset-filled-surface-100-900">
      <i class="fa-solid fa-chart-line text-4xl text-primary-500 mb-4"></i>
      <h2 class="h3 mb-2">Progress Tracking</h2>
      <p class="opacity-75">Log your ascents, track projects, and visualize your climbing progression.</p>
    </div>

    <div class="card p-6 preset-filled-surface-100-900">
      <i class="fa-solid fa-users text-4xl text-primary-500 mb-4"></i>
      <h2 class="h3 mb-2">Community</h2>
      <p class="opacity-75">Connect with other climbers, share beta, and discover new climbing spots.</p>
    </div>
  </section>

  <!-- Integration Section -->
  <section class="py-16 text-center">
    <h2 class="h2 mb-8">Integrates with Your Favorite Platforms</h2>
    <div class="flex justify-center items-center gap-8">
      <img src={Logo8a} alt="8a" class="h-8 opacity-75 hover:opacity-100 transition-opacity" />
      <img src={Logo27crags} alt="27crags" class="h-8 opacity-75 hover:opacity-100 transition-opacity" />
      <img src={LogoTheCrag} alt="The Crag" class="h-8 opacity-75 hover:opacity-100 transition-opacity" />
    </div>
  </section>
{:else if data.userPermissions?.includes('data.read')}
  <div class="-m-[0.5rem] md:-m-[1rem]" use:fitHeightAction={{ paddingBottom: 0 }}>
    {#await import('$lib/components/BlocksMap') then BlocksMap}
      <BlocksMap.default blocks={data.blocks} />
    {/await}
  </div>
{:else}
  <div class="card p-6 max-w-md mx-auto mt-8 preset-filled-surface-100-900">
    <h2 class="h3 mb-4 text-center">Thank you for signing up for {PUBLIC_APPLICATION_NAME}</h2>

    <p class="text-center opacity-75 mb-4">
      Your account is currently pending approval from our administrators. This helps us maintain the quality and
      security of our climbing community.
    </p>

    <div class="space-y-4 opacity-75">
      <p class="text-center text-xl">What happens next:</p>
      <ol class="list-decimal list-inside text-left space-y-2">
        <li>Our team will review your request (usually within 24 hours)</li>
        <li>You'll receive an email when your account is approved</li>
        <li>Once approved, you can log in and start tracking your climbs</li>
      </ol>
    </div>

    <p class="text-center opacity-75 mt-6">
      {#if PUBLIC_TOPO_EMAIL}
        If you don't receive an email within 24 hours, please check your spam folder or reach out to us at
        <a class="anchor" href="mailto:{PUBLIC_TOPO_EMAIL}">{PUBLIC_TOPO_EMAIL}</a>.
      {:else}
        If you don't receive an email within 24 hours, please check your spam folder.
      {/if}
    </p>
  </div>
{/if}
