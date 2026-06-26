<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import iconTheTopo from '$lib/assets/27crags-logo.png'
  import icon8a from '$lib/assets/8a-logo.png'
  import Logo from '$lib/assets/logo.svg'
  import iconTheCrag from '$lib/assets/thecrag-logo.png'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'
  import BoulderThree from './BoulderThree.svelte'

  const { data } = $props()
  // SSR-resolved (see +page.server.ts) so the header CTA renders correctly without a flash.
  const signedIn = $derived(data.signedIn)

  const github = 'https://github.com/robert-wettstaedt/grnyte'
  const demo = 'https://demo.grnyte.rocks/auth/signin'

  const features: { title: string; body: string; icon: IconName }[] = [
    { title: m.landing_featurePrivateTitle(), body: m.landing_featurePrivateBody(), icon: 'lock' },
    { title: m.landing_featureGuidebookTitle(), body: m.landing_featureGuidebookBody(), icon: 'map' },
    { title: m.landing_featureMapsTitle(), body: m.landing_featureMapsBody(), icon: 'map-pin' },
    { title: m.landing_featureOfflineTitle(), body: m.landing_featureOfflineBody(), icon: 'smartphone' },
    { title: m.landing_featureLogbookTitle(), body: m.landing_featureLogbookBody(), icon: 'trending-up' },
    { title: m.landing_featureRegionTitle(), body: m.landing_featureRegionBody(), icon: 'users' },
  ]

  const personas: { title: string; body: string; icon: IconName }[] = [
    { title: m.landing_personaDevelopersTitle(), body: m.landing_personaDevelopersBody(), icon: 'pickaxe' },
    { title: m.landing_personaCommunitiesTitle(), body: m.landing_personaCommunitiesBody(), icon: 'users-round' },
    { title: m.landing_personaRegionsTitle(), body: m.landing_personaRegionsBody(), icon: 'tent-tree' },
  ]

  // Public platforms to export to once an area goes public.
  const platforms = [
    { name: '8a.nu', icon: icon8a },
    { name: 'The Topo', icon: iconTheTopo },
    { name: 'theCrag', icon: iconTheCrag },
  ]

  // "A look inside" phone mockups. Placeholder frames for now — drop a real <img> into
  // each .lp-screen once the 2.0 UI is ready. Real shots MUST use demo/dummy data,
  // never a live private region (that's the whole point of the product).
  const shots = [
    { label: m.landing_shotMapLabel(), caption: m.landing_shotMapCaption() },
    { label: m.landing_shotTopoLabel(), caption: m.landing_shotTopoCaption() },
    { label: m.landing_shotLogbookLabel(), caption: m.landing_shotLogbookCaption() },
  ]

  // ===== scroll motion (GSAP): heavy + browser-only, loaded via dynamic import in onMount =====
  let rootEl: HTMLDivElement

  onMount(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const disposers: Array<() => void> = []
    let cancelled = false

    // GSAP — hero entrance, contour line-draw, scroll reveals, hero parallax.
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return
        gsap.registerPlugin(ScrollTrigger)
        disposers.push(() => ScrollTrigger.getAll().forEach((t) => t.kill()))
        if (reduced) return // reveals stay put; content is already visible

        const root = rootEl
        gsap.ticker.lagSmoothing(0)

        gsap.fromTo(
          root.querySelectorAll('[data-hero] [data-fade]'),
          { y: 26, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.85, stagger: 0.09, ease: 'power3.out', delay: 0.1 },
        )

        root.querySelectorAll<SVGPathElement>('[data-contour]').forEach((p, i) => {
          const len = p.getTotalLength()
          p.style.strokeDasharray = String(len)
          gsap.fromTo(
            p,
            { strokeDashoffset: len },
            { strokeDashoffset: 0, duration: 2.2, delay: 0.15 + i * 0.18, ease: 'power2.out' },
          )
        })

        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
          const target = el.children.length === 1 ? el.children[0] : el
          gsap.fromTo(
            target,
            { y: 32, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 82%' } },
          )
        })

        root.querySelectorAll<HTMLElement>('[data-stagger]').forEach((grid) => {
          gsap.fromTo(
            grid.children,
            { y: 28, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.7,
              stagger: 0.08,
              ease: 'power3.out',
              scrollTrigger: { trigger: grid, start: 'top 82%' },
            },
          )
        })

        const hero = root.querySelector('[data-hero]')
        const heroSvg = root.querySelector('[data-hero] > svg')
        if (hero && heroSvg) {
          gsap.to(heroSvg, {
            yPercent: 12,
            ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
          })
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      disposers.forEach((d) => d())
    }
  })
</script>

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME} · {m.landing_metaTitle()}</title>
  <meta name="description" content={m.landing_metaDescription()} />
</svelte:head>

<div bind:this={rootEl} class="text-surface-950-50 bg-surface-50-950 min-h-dvh overflow-x-clip">
  <!-- ===== sticky nav ===== -->
  <header class="border-surface-200-800 bg-surface-50-950/80 sticky top-0 z-50 border-b backdrop-blur-lg">
    <div class="mx-auto flex h-15 max-w-300 items-center justify-between gap-4 px-5">
      <a href={resolve('/')} class="text-surface-950-50 flex items-center gap-2.5 no-underline">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="block h-7.5 w-7.5 rounded-lg" />
        <strong class="[font-family:var(--heading-font-family)] text-[19px] font-bold tracking-tight">
          {PUBLIC_APPLICATION_NAME}
        </strong>
      </a>
      <nav class="flex items-center gap-2.5">
        <a
          href={github}
          target="_blank"
          rel="noopener"
          class="btn btn-sm text-surface-600-400 hover:preset-tonal gap-2"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.39-5.27 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
            />
          </svg>
          {m.landing_navSource()}
        </a>
        <a
          href={signedIn ? resolve('/explore') : resolve('/auth/signin')}
          class="btn btn-sm preset-filled-primary-500 font-bold"
        >
          {signedIn ? m.landing_navToApp() : m.landing_getStarted()}
        </a>
      </nav>
    </div>
  </header>

  <!-- ===== hero ===== -->
  <section data-hero class="relative overflow-clip">
    <!-- contour background -->
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      class="absolute inset-0 h-full w-full opacity-90"
      aria-hidden="true"
    >
      <g fill="none" stroke-width="1.5" class="stroke-surface-200-800">
        <path data-contour d="M-100 720 C 200 640 380 760 720 690 C 1060 620 1240 730 1540 660" />
        <path data-contour d="M-100 780 C 240 700 420 820 760 750 C 1100 680 1280 790 1540 720" />
        <path data-contour d="M-100 200 C 240 120 480 240 820 170 C 1120 110 1300 200 1540 140" />
        <path data-contour d="M-100 130 C 260 60 500 170 840 100 C 1140 40 1320 130 1540 70" />
        <path data-contour d="M-100 460 C 300 380 560 520 900 440 C 1200 370 1360 460 1540 410" opacity="0.6" />
      </g>
    </svg>
    <div
      class="relative mx-auto grid min-h-[calc(100vh-60px)] max-w-300 grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-center gap-[clamp(24px,4vw,56px)] px-5 pt-[clamp(48px,8vh,96px)] pb-[clamp(40px,6vh,72px)]"
    >
      <div class="flex max-w-140 flex-col gap-5.5">
        <div
          data-fade
          class="chip bg-primary-500/15 text-primary-600-400 gap-2 self-start text-[12.5px] font-bold tracking-wide"
        >
          <Icon name="lock" size={13} strokeWidth={2.4} />
          {m.landing_heroBadge()}
        </div>
        <h1 data-fade class="text-[clamp(36px,5.6vw,62px)] leading-[1.04] font-bold tracking-[-0.03em] text-balance">
          {m.landing_heroTitle()}
        </h1>
        <p
          data-fade
          class="text-surface-600-400 max-w-[52ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-pretty"
        >
          {m.landing_heroSubtitle()}
        </p>
        <div data-fade class="mt-1.5 flex flex-wrap gap-3">
          <a
            href={resolve('/auth/signin')}
            class="btn preset-filled-primary-500 h-12.5 px-6 font-semibold shadow-[0_10px_28px_-10px_var(--color-primary-500)]"
          >
            {m.landing_getStarted()}
          </a>
          <a href={demo} target="_blank" rel="noopener" class="btn preset-tonal h-12.5 gap-2.5 px-6 font-semibold">
            <Icon name="play" size={16} fill="currentColor" strokeWidth={0} />
            {m.landing_heroDemo()}
          </a>
        </div>
        <div data-fade class="text-surface-500 flex items-center gap-2.5 text-[13px]">
          <Icon name="check" size={14} strokeWidth={2.2} />
          {m.landing_heroTrust()}
        </div>
      </div>

      <!-- boulder (three.js): rocked side-to-side so the routed face stays toward the viewer -->
      <div class="relative h-[clamp(300px,52vh,640px)] min-w-0">
        <BoulderThree />
        <!-- caption chip -->
        <div
          class="chip border-surface-200-800 bg-surface-100-900/85 absolute bottom-1.5 left-1/2 -translate-x-1/2 gap-1.5 border text-[12px] whitespace-nowrap backdrop-blur-[10px]"
        >
          <span class="h-2 w-2 rounded-full bg-[oklch(0.69_0.18_52)]"></span>
          <span class="-ml-0.75 h-2 w-2 rounded-full bg-[oklch(0.72_0.15_150)]"></span>
          <span class="-ml-0.75 h-2 w-2 rounded-full bg-[oklch(0.62_0.22_28)]"></span>
          {m.landing_heroCaption()}
        </div>
      </div>
    </div>
  </section>

  <!-- ===== narrative (problem) ===== -->
  <section class="border-surface-200-800 border-t">
    <div data-reveal class="mx-auto flex max-w-190 flex-col gap-6 px-5 py-[clamp(64px,10vh,110px)]">
      <div class="text-primary-600-400 text-[12.5px] font-bold tracking-widest uppercase">{m.landing_whyEyebrow()}</div>
      <h2 class="text-[clamp(26px,3.4vw,38px)] leading-[1.15] font-bold tracking-tight text-balance">
        {m.landing_whyTitle()}
      </h2>
      <p class="text-surface-600-400 text-[clamp(15.5px,1.5vw,18px)] leading-relaxed text-pretty">
        {m.landing_whyBody1()}
      </p>
      <p class="text-surface-600-400 text-[clamp(15.5px,1.5vw,18px)] leading-relaxed text-pretty">
        {m.landing_whyBody2()}
      </p>
    </div>
  </section>

  <!-- ===== product showcase ===== -->
  <section class="border-surface-200-800 border-t">
    <div class="mx-auto max-w-300 px-5 py-[clamp(64px,10vh,110px)]">
      <div data-reveal class="mx-auto mb-13 flex max-w-155 flex-col gap-3.5 text-center">
        <div class="text-primary-600-400 text-[12.5px] font-bold tracking-widest uppercase">
          {m.landing_peekEyebrow()}
        </div>
        <h2 class="text-[clamp(26px,3.4vw,38px)] leading-[1.15] font-bold tracking-tight text-balance">
          {m.landing_peekTitle()}
        </h2>
      </div>

      <!-- Mobile: horizontal scroll-snap row (swipe, neighbours peek). md+: centered staggered row. -->
      <div
        data-stagger
        class="-mx-5 flex snap-x snap-mandatory scrollbar-none items-end gap-[clamp(20px,4vw,44px)] overflow-x-auto px-5 pb-2 md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0 md:pb-0"
      >
        {#each shots as s, i (s.label)}
          <figure
            class="flex shrink-0 snap-center flex-col items-center gap-4 transition hover:-translate-y-1.25 {i === 1
              ? 'z-10 w-[min(256px,80vw)] md:mb-[clamp(0px,5vw,52px)]'
              : 'w-[min(224px,72vw)]'}"
          >
            <!-- phone bezel. When the real shots land, add the screenshot as the first child of
                 .lp-screen and delete the placeholder markup below:
                 <img src={s.src} alt={s.caption} class="absolute inset-0 h-full w-full object-cover"
                      loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={i === 0 ? 'high' : 'auto'} /> -->
            <div
              class="border-surface-200-800 bg-surface-950 aspect-9/19.5 w-full rounded-4xl border p-2.25 shadow-[0_44px_80px_-36px_black,inset_0_0_0_1px_oklch(0.28_0.01_305)]"
            >
              <div class="lp-screen bg-surface-100-900 relative h-full w-full overflow-hidden rounded-[23px]">
                <!-- faux contour motif so the placeholder reads as 'app screen', not 'broken image' -->
                <svg
                  viewBox="0 0 240 520"
                  preserveAspectRatio="xMidYMid slice"
                  class="absolute inset-0 h-full w-full opacity-50"
                  aria-hidden="true"
                >
                  <g fill="none" stroke-width="1.4" class="stroke-surface-200-800">
                    <path d="M-20 150 C 60 120 120 180 260 140" />
                    <path d="M-20 220 C 70 190 130 250 260 210" />
                    <path d="M-20 360 C 60 330 120 390 260 350" />
                    <path d="M-20 430 C 70 400 130 460 260 420" />
                  </g>
                </svg>
                <!-- faux top bar -->
                <div class="bg-primary-500/15 absolute top-0 right-0 left-0 flex h-11.5 items-center gap-1.5 px-3.5">
                  <span class="bg-primary-500 h-2.25 w-2.25 rounded-full"></span>
                  <span class="bg-surface-400-600 h-1.75 w-13.5 rounded-full"></span>
                </div>
                <!-- faux content rows so the frame reads as a populated screen, not an empty one -->
                <div class="absolute top-16 right-0 left-0 flex flex-col gap-2.5 px-4" aria-hidden="true">
                  <span class="bg-surface-300-700 h-2 w-2/3 rounded-full"></span>
                  <span class="bg-surface-200-800 h-2 w-5/6 rounded-full"></span>
                  <span class="bg-surface-200-800 h-2 w-3/4 rounded-full"></span>
                  <span class="bg-surface-300-700 mt-3 h-2 w-1/2 rounded-full"></span>
                  <span class="bg-surface-200-800 h-2 w-4/5 rounded-full"></span>
                </div>
                <!-- screen label -->
                <div class="absolute right-0 bottom-4 left-0 flex justify-center">
                  <span class="chip preset-tonal-surface font-mono text-[13px] font-semibold">
                    {s.label}
                  </span>
                </div>
              </div>
            </div>
            <figcaption class="flex flex-col gap-0.75 text-center">
              <span class="text-[15.5px] font-bold">{s.label}</span>
              <span class="text-surface-600-400 max-w-[24ch] text-[13.5px] leading-normal">{s.caption}</span>
            </figcaption>
          </figure>
        {/each}
      </div>
    </div>
  </section>

  <!-- ===== features ===== -->
  <section class="border-surface-200-800 bg-surface-100-900 border-t">
    <div class="mx-auto max-w-300 px-5 py-[clamp(64px,10vh,110px)]">
      <div data-reveal class="mb-11 flex max-w-160 flex-col gap-3.5">
        <div class="text-primary-600-400 text-[12.5px] font-bold tracking-widest uppercase">
          {m.landing_featuresEyebrow()}
        </div>
        <h2 class="text-[clamp(26px,3.4vw,38px)] leading-[1.15] font-bold tracking-tight text-balance">
          {m.landing_featuresTitle()}
        </h2>
      </div>
      <div data-stagger class="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
        {#each features as f (f.title)}
          <div class="card bg-surface-200-800 flex flex-col gap-3 p-6 transition hover:-translate-y-0.5">
            <span
              class="bg-primary-500/15 text-primary-600-400 flex h-10.5 w-10.5 items-center justify-center rounded-xl"
            >
              <Icon name={f.icon} size={21} strokeWidth={1.9} />
            </span>
            <h3 class="text-[17.5px] font-bold tracking-tight">{f.title}</h3>
            <p class="text-surface-600-400 text-[14.5px] leading-relaxed text-pretty">
              {f.body}
            </p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ===== personas ===== -->
  <section class="border-surface-200-800 border-t">
    <div class="mx-auto max-w-300 px-5 py-[clamp(64px,10vh,110px)]">
      <h2 data-reveal class="mb-10 text-center text-[clamp(26px,3.4vw,38px)] font-bold tracking-tight text-balance">
        {m.landing_personasTitle()}
      </h2>
      <div data-stagger class="mx-auto grid max-w-250 grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3.5">
        {#each personas as p (p.title)}
          <div class="flex flex-col items-center gap-3 px-6 py-7.5 text-center">
            <span
              class="text-primary-600-400 border-surface-200-800 bg-surface-100-900 flex h-12.5 w-12.5 items-center justify-center rounded-[15px] border"
            >
              <Icon name={p.icon} size={21} strokeWidth={1.9} />
            </span>
            <h3 class="text-[17px] font-bold">{p.title}</h3>
            <p class="text-surface-600-400 max-w-[34ch] text-[14.5px] leading-relaxed">{p.body}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ===== go public ===== -->
  <section class="border-surface-200-800 bg-surface-100-900 border-t">
    <div
      data-reveal
      class="mx-auto flex max-w-190 flex-col items-center gap-4.5 px-5 py-[clamp(56px,9vh,96px)] text-center"
    >
      <h2 class="text-[clamp(24px,3vw,34px)] font-bold tracking-tight text-balance">
        {m.landing_exportTitle()}
      </h2>
      <p class="text-surface-600-400 max-w-[52ch] text-[clamp(15px,1.5vw,17px)] leading-relaxed">
        {m.landing_exportBody()}
      </p>
      <div class="mt-2 flex flex-wrap justify-center gap-2.5">
        {#each platforms as p (p.name)}
          <span class="chip preset-outlined-surface-200-800 gap-2 pr-4.5 pl-3.5 font-mono text-[14px] font-semibold">
            <img src={p.icon} alt="" width="18" height="18" loading="lazy" class="block h-4.5 w-4.5 rounded" />
            {p.name}
          </span>
        {/each}
      </div>
    </div>
  </section>

  <!-- ===== CTA band ===== -->
  <section class="border-surface-200-800 border-t">
    <div data-reveal class="mx-auto max-w-300 px-5 py-[clamp(56px,9vh,96px)]">
      <div
        class="preset-filled-primary-500 relative overflow-clip rounded-3xl px-[clamp(24px,5vw,64px)] py-[clamp(40px,6vw,72px)]"
      >
        <svg
          viewBox="0 0 1200 400"
          preserveAspectRatio="xMidYMid slice"
          class="absolute inset-0 h-full w-full opacity-35"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M-50 320 C 250 250 450 360 750 290 C 1000 230 1150 310 1250 270" />
            <path d="M-50 260 C 280 190 480 300 780 230 C 1030 170 1180 250 1250 210" />
          </g>
        </svg>
        <div class="relative flex flex-wrap items-center justify-between gap-6">
          <div class="flex max-w-140 flex-col gap-2.5">
            <h2 class="text-primary-contrast-500 text-[clamp(24px,3.2vw,36px)] font-bold tracking-tight text-balance">
              {m.landing_ctaTitle()}
            </h2>
            <p class="text-primary-contrast-500/85 text-[15.5px] leading-relaxed">
              {m.landing_ctaBody()}
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <a href={resolve('/auth/signin')} class="btn preset-filled-surface-50-950 h-12.5 px-6 font-semibold">
              {m.landing_getStarted()}
            </a>
            <a
              href={github}
              target="_blank"
              rel="noopener"
              class="btn text-primary-contrast-500 border-primary-contrast-500/40 hover:bg-primary-contrast-500/10 h-12.5 gap-2 border px-6 font-semibold"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.39-5.27 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
                />
              </svg>
              {m.landing_ctaStar()}
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== name explainer (brand flavor) ===== -->
  <section class="border-surface-200-800 bg-surface-50-950 border-t">
    <div data-reveal class="mx-auto flex max-w-190 flex-col gap-5 px-5 py-[clamp(44px,7vh,72px)]">
      <div class="text-primary-600-400 text-[12.5px] font-bold tracking-widest uppercase">
        {m.landing_nameEyebrow()}
      </div>
      <div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <span
          class="[font-family:var(--heading-font-family)] text-[clamp(32px,4.5vw,46px)] leading-none font-bold tracking-[-0.03em]"
        >
          {PUBLIC_APPLICATION_NAME}
        </span>
        <span class="text-surface-500 text-[15px] italic">{m.landing_nameNoun()}</span>
        <span class="text-surface-600-400 inline-flex items-center gap-2 font-mono text-[16px]">
          <Icon name="volume-1" size={16} class="text-primary-600-400" />
          /ˈɡrænɪt/
        </span>
      </div>
      <p class="text-surface-950-50 max-w-[60ch] text-[clamp(16px,1.6vw,18.5px)] leading-relaxed text-pretty">
        <em class="text-primary-600-400 font-semibold not-italic">{m.landing_nameDefinitionEm()}</em>
        {m.landing_nameDefinitionRest()}
      </p>
    </div>
  </section>

  <!-- ===== footer ===== -->
  <footer class="border-surface-200-800 bg-surface-100-900 border-t">
    <div class="mx-auto max-w-300 px-5 pt-12 pb-9">
      <div class="flex flex-wrap justify-between gap-9">
        <div class="flex max-w-80 flex-col gap-3">
          <div class="flex items-center gap-2.5">
            <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="block h-6.5 w-6.5 rounded-lg" />
            <strong class="text-[16px] font-bold">{PUBLIC_APPLICATION_NAME}</strong>
          </div>
          <p class="text-surface-500 text-[13.5px] leading-relaxed">
            {m.landing_footerDesc()}
          </p>
          <a
            href={resolve('/status')}
            class="text-surface-600-400 hover:text-surface-950-50 text-[13px] font-semibold no-underline transition-colors"
          >
            {m.landing_footerStatus()}
          </a>
        </div>
        <div class="flex flex-wrap gap-16">
          <div class="flex flex-col gap-2.5">
            <div class="text-surface-950-50 text-[13px] font-bold">{m.landing_footerLegal()}</div>
            <a
              href={resolve('/legal/privacy')}
              class="text-surface-500 hover:text-surface-950-50 text-[13px] no-underline transition-colors"
            >
              {m.legal_layout_001()}
            </a>
            <a
              href={resolve('/legal/terms')}
              class="text-surface-500 hover:text-surface-950-50 text-[13px] no-underline transition-colors"
            >
              {m.legal_layout_002()}
            </a>
            <a
              href={resolve('/legal/cookies')}
              class="text-surface-500 hover:text-surface-950-50 text-[13px] no-underline transition-colors"
            >
              {m.legal_layout_003()}
            </a>
            <a
              href={resolve('/legal/disclaimer')}
              class="text-surface-500 hover:text-surface-950-50 text-[13px] no-underline transition-colors"
            >
              {m.legal_disclaimer_title()}
            </a>
          </div>
        </div>
      </div>
      <div
        class="border-surface-200-800 text-surface-500 mt-9 flex flex-wrap justify-between gap-3 border-t pt-6 text-[12.5px]"
      >
        <span>{m.landing_footerCopyright()}</span>
        <span class="inline-flex items-center gap-2">
          <a
            href={github}
            target="_blank"
            rel="noopener"
            class="hover:text-primary-600-400 text-surface-600-400 font-semibold no-underline transition-colors"
          >
            {m.landing_navSource()}
          </a>
          <span class="opacity-50">·</span>
          <span>{m.landing_footerMadeWith()}</span>
        </span>
      </div>
    </div>
  </footer>
</div>
