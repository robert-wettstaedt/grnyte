<script lang="ts">
  import { PUBLIC_DEMO_MODE } from '$env/static/public'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'
  import { getI18n } from '$lib/i18n'

  const { t } = getI18n()

  const features = $derived([
    {
      icon: 'fa-solid fa-lock',
      title: t('landing.features.accessProtection.title'),
      description: t('landing.features.accessProtection.description'),
    },
    {
      icon: 'fa-solid fa-users-gear',
      title: t('landing.features.professionalCollaboration.title'),
      description: t('landing.features.professionalCollaboration.description'),
    },
    {
      icon: 'fa-solid fa-database',
      title: t('landing.features.dataIntegrity.title'),
      description: t('landing.features.dataIntegrity.description'),
    },
    {
      icon: 'fa-solid fa-map-marked-alt',
      title: t('landing.features.completeAreaManagement.title'),
      description: t('landing.features.completeAreaManagement.description'),
    },
    {
      icon: 'fa-solid fa-chart-line',
      title: t('landing.features.developmentDocumentation.title'),
      description: t('landing.features.developmentDocumentation.description'),
    },
    {
      icon: 'fa-solid fa-upload',
      title: t('landing.features.easyMigration.title'),
      description: t('landing.features.easyMigration.description'),
    },
  ])
</script>

<!-- Hero Section -->
<section class="relative z-0 flex min-h-[calc(100vh-1rem-48px)] items-center md:min-h-[calc(100vh-2rem-48px)]">
  <div class="absolute -inset-2 -z-10 overflow-hidden blur-sm brightness-50 md:-inset-4">
    <video class="min-h-full min-w-full object-cover" autoplay loop muted>
      <source
        src="https://niniugtqbfituyzfoapv.supabase.co/storage/v1/object/public/crag-track/20241222_1354_Mossy%20Forest%20Boulder_storyboard_01jfq6xey9esm8kpfzwfpc09xn.mp4?t=2025-01-01T12%3A18%3A56.818Z"
        type="video/mp4"
      />
      Your browser does not support the video tag.
    </video>
  </div>

  <div class="container mx-auto px-4 text-center">
    <h1 class="h1 mb-4">{t('landing.hero.title')}</h1>

    <p class="mx-auto mb-8 max-w-2xl text-xl opacity-75">
      {t('landing.hero.subtitle')}
    </p>

    <div class="flex flex-wrap justify-center gap-4">
      <a href="/auth" class="btn preset-filled-primary-500">
        <i class="fa-solid fa-shield-heart mr-2"></i>
        {t('landing.hero.secureAreas')}
      </a>

      {#if !PUBLIC_DEMO_MODE}
        <a
          class="btn preset-outlined-primary-500"
          href="https://demo.grnyte.rocks/auth/signin"
          rel="noopener noreferrer"
          target="_blank"
        >
          <i class="fa-solid fa-play mr-2"></i>
          {t('landing.hero.tryDemo')}
        </a>
      {/if}
    </div>
  </div>
</section>

<!-- Problem Statement -->
<section class="py-16">
  <div class="container mx-auto px-4 text-center">
    <h2 class="h2 mb-8">{t('landing.problem.title')}</h2>

    <div class="mx-auto mb-12 max-w-3xl">
      <p class="mb-6 text-lg opacity-90">
        {t('landing.problem.paragraph1')}
      </p>
      <p class="text-lg opacity-90">
        {t('landing.problem.paragraph2')}
      </p>
    </div>
  </div>
</section>

<!-- Core Features -->
<section class="py-16">
  <div class="container mx-auto px-4">
    <h2 class="h2 mb-12 text-center">{t('landing.features.title')}</h2>

    <!-- Mobile Carousel with Scroll Snap (shown on mobile, hidden on md and up) -->
    <div class="md:hidden">
      <div class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {#each features as feature}
          <div class="w-8/10 shrink-0 snap-center sm:w-80">
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
    <h2 class="h2 mb-8">{t('landing.perfectFor.title')}</h2>

    <div class="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
      <div class="p-6">
        <i class="fa-solid fa-hammer text-primary-500 mb-4 text-3xl"></i>
        <h3 class="h5 mb-2">{t('landing.perfectFor.areaDevelopers.title')}</h3>
        <p class="opacity-75">{t('landing.perfectFor.areaDevelopers.description')}</p>
      </div>

      <div class="p-6">
        <i class="fa-solid fa-user-friends text-primary-500 mb-4 text-3xl"></i>
        <h3 class="h5 mb-2">{t('landing.perfectFor.localCommunities.title')}</h3>
        <p class="opacity-75">{t('landing.perfectFor.localCommunities.description')}</p>
      </div>

      <div class="p-6">
        <i class="fa-solid fa-tree text-primary-500 mb-4 text-3xl"></i>
        <h3 class="h5 mb-2">{t('landing.perfectFor.privateLandStewards.title')}</h3>
        <p class="opacity-75">{t('landing.perfectFor.privateLandStewards.description')}</p>
      </div>
    </div>
  </div>
</section>

<!-- Integration Section -->
<section class="py-16 text-center">
  <div class="container mx-auto px-4">
    <h2 class="h2 mb-8">{t('landing.integration.title')}</h2>
    <p class="mx-auto mb-8 max-w-2xl opacity-75">
      {t('landing.integration.description')}
    </p>
    <div class="flex items-center justify-center gap-8">
      <img src={Logo8a} alt="8a" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
      <img src={Logo27crags} alt="27crags" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
      <img src={LogoTheCrag} alt="The Crag" class="h-8 opacity-75 transition-opacity hover:opacity-100" />
    </div>
  </div>
</section>
