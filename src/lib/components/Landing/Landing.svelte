<script lang="ts">
  import { PUBLIC_DEMO_MODE } from '$env/static/public'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'

  const features = [
    {
      icon: 'fa-solid fa-lock',
      title: 'Access Protection',
      description:
        'Keep sensitive areas private with invitation-only communities. Perfect for private land where public exposure risks closure.',
    },
    {
      icon: 'fa-solid fa-users-gear',
      title: 'Professional Collaboration',
      description:
        'Replace email chains and version conflicts. Your entire team sees updates instantly with proper change tracking.',
    },
    {
      icon: 'fa-solid fa-database',
      title: 'Data Integrity',
      description:
        'Import your Excel files and upgrade to professional area management. Never lose development work to corrupted files again.',
    },
    {
      icon: 'fa-solid fa-map-marked-alt',
      title: 'Complete Area Management',
      description:
        'Organize areas, sectors, and problems with detailed topos, grades, and conditions. Built specifically for boulder development.',
    },
    {
      icon: 'fa-solid fa-chart-line',
      title: 'Development Documentation',
      description:
        'Document first ascents, cleaning progress, and project status. See how your area evolves over time with detailed analytics.',
    },
    {
      icon: 'fa-solid fa-upload',
      title: 'Easy Migration',
      description:
        'Import existing problem lists from Excel or CSV. Migrate decades of development work in minutes, not months.',
    },
  ]
</script>

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
    <h1 class="h1 mb-4">Protect Your Private Land Bouldering Areas</h1>

    <p class="mx-auto mb-8 max-w-2xl text-xl opacity-75">
      Professional area management for sensitive access locations. Keep your development projects secure, collaborate
      with your community, and never lose your data again.
    </p>

    <div class="flex justify-center gap-4">
      <a href="/auth" class="btn preset-filled-primary-500">
        <i class="fa-solid fa-shield-heart mr-2"></i>
        Secure My Areas
      </a>

      {#if !PUBLIC_DEMO_MODE}
        <a
          class="btn preset-outlined-primary-500"
          href="https://demo.grnyte.rocks/auth/signin"
          rel="noopener noreferrer"
          target="_blank"
        >
          <i class="fa-solid fa-play mr-2"></i>
          Try Demo
        </a>
      {/if}
    </div>
  </div>
</section>

<!-- Problem Statement -->
<section class="py-16">
  <div class="container mx-auto px-4 text-center">
    <h2 class="h2 mb-8">Why Area Developers Choose Privacy-First Tools</h2>

    <div class="mx-auto mb-12 max-w-3xl">
      <p class="mb-6 text-lg opacity-90">
        Developing bouldering areas on private land requires careful balance between community collaboration and access
        protection. One misplaced coordinate or overshared beta can jeopardize years of relationship building with
        landowners.
      </p>
      <p class="text-lg opacity-90">
        Meanwhile, managing development data across scattered Excel files and email chains creates version conflicts,
        data loss risks, and collaboration headaches that slow down progress.
      </p>
    </div>
  </div>
</section>

<!-- Core Features -->
<section class="py-16">
  <div class="container mx-auto px-4">
    <h2 class="h2 mb-12 text-center">Built for Area Developers Who Value Access</h2>

    <!-- Mobile Carousel with Scroll Snap (shown on mobile, hidden on md and up) -->
    <div class="md:hidden">
      <div class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {#each features as feature}
          <div class="w-8/10 flex-shrink-0 snap-center sm:w-80">
            <div class="card preset-filled-surface-100-900 h-full p-6">
              <i class="{feature.icon} text-primary-500 mb-4 text-4xl"></i>
              <h3 class="h4 mb-3">{feature.title}</h3>
              <p class="opacity-75">{feature.description}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Desktop Grid (hidden on mobile, shown on md and up) -->
    <div class="hidden gap-8 md:grid md:grid-cols-2 lg:grid-cols-3">
      {#each features as feature}
        <div class="card preset-filled-surface-100-900 p-6">
          <i class="{feature.icon} text-primary-500 mb-4 text-4xl"></i>
          <h3 class="h4 mb-3">{feature.title}</h3>
          <p class="opacity-75">{feature.description}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Who This Is For -->
<section class="bg-surface-100-900 py-16">
  <div class="container mx-auto px-4 text-center">
    <h2 class="h2 mb-8">Perfect For</h2>

    <div class="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
      <div class="p-6">
        <i class="fa-solid fa-hammer text-primary-500 mb-4 text-3xl"></i>
        <h3 class="h5 mb-2">Area Developers</h3>
        <p class="opacity-75">First ascentionists and route setters managing ongoing development projects</p>
      </div>

      <div class="p-6">
        <i class="fa-solid fa-user-friends text-primary-500 mb-4 text-3xl"></i>
        <h3 class="h5 mb-2">Local Communities</h3>
        <p class="opacity-75">Tight-knit climbing groups with sensitive access areas requiring discretion</p>
      </div>

      <div class="p-6">
        <i class="fa-solid fa-tree text-primary-500 mb-4 text-3xl"></i>
        <h3 class="h5 mb-2">Private Land Stewards</h3>
        <p class="opacity-75">Landowners and permitted groups managing sustainable access programs</p>
      </div>
    </div>
  </div>
</section>

<!-- Integration Section -->
<section class="py-16 text-center">
  <div class="container mx-auto px-4">
    <h2 class="h2 mb-8">When You're Ready to Go Public</h2>
    <p class="mx-auto mb-8 max-w-2xl opacity-75">
      Once access is secured and areas are established, easily export your data to public platforms when appropriate.
    </p>
    <div class="flex items-center justify-center gap-8">
      <img src={Logo8a} alt="8a" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
      <img src={Logo27crags} alt="27crags" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
      <img src={LogoTheCrag} alt="The Crag" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
    </div>
  </div>
</section>
