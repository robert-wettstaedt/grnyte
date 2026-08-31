<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import BoulderThree from './BoulderThree.svelte'

  const { data } = $props()
  // SSR-resolved (see +page.server.ts) so the header CTA renders correctly without a flash.
  const signedIn = $derived(data.signedIn)

  const github = 'https://github.com/robert-wettstaedt/grnyte'
  const contact = 'mailto:info@grnyte.rocks'

  // The three situations an area cannot be published in. A qualification section, not a
  // status-quo one: the reader self-selects instead of being told what their setup is.
  const reasons: { body: string; icon: IconName; title: string }[] = [
    { body: m.landing_whyFragileBody(), icon: 'alert-triangle', title: m.landing_whyFragileTitle() },
    { body: m.landing_whyProjectBody(), icon: 'pickaxe', title: m.landing_whyProjectTitle() },
    { body: m.landing_whyAccessBody(), icon: 'eye-off', title: m.landing_whyAccessTitle() },
  ]

  const features: { body: string; icon: IconName; title: string }[] = [
    { body: m.landing_featurePrivateBody(), icon: 'lock', title: m.landing_featurePrivateTitle() },
    { body: m.landing_featureGuidebookBody(), icon: 'map', title: m.landing_featureGuidebookTitle() },
    { body: m.landing_featureTopoBody(), icon: 'route', title: m.landing_featureTopoTitle() },
    { body: m.landing_featureMapsBody(), icon: 'map-pin', title: m.landing_featureMapsTitle() },
    { body: m.landing_featureOfflineBody(), icon: 'smartphone', title: m.landing_featureOfflineTitle() },
    { body: m.landing_featureLogbookBody(), icon: 'trending-up', title: m.landing_featureLogbookTitle() },
  ]


  // "A look inside". `src`/`poster` are empty until the screencasts land (see DEMO-TEARDOWN-PLAN.md):
  // drop `static/shot-*.mp4` and `static/shot-*.jpg` in and fill them here, nothing else changes.
  // Real shots MUST use the dummy fixture, never a live private region: that is the whole product.
  const shots: { caption: string; label: string; poster?: string; src?: string }[] = [
    { caption: m.landing_shotMapCaption(), label: m.landing_shotMapLabel() },
    { caption: m.landing_shotTopoCaption(), label: m.landing_shotTopoLabel() },
    { caption: m.landing_shotLogbookCaption(), label: m.landing_shotLogbookLabel() },
  ]

  // ===== scroll motion (GSAP): heavy + browser-only, loaded via dynamic import in onMount =====
  let rootEl: HTMLDivElement
  // Never re-hide something the visitor can already see. If the CSS failsafe (the `data-motion`
  // rules in the stylesheet at the foot of this file) revealed a section before GSAP got here, it
  // has been read and must stay put. Anything below the fold is still safe to animate however late
  // GSAP is, so whether the scroll reveals run never depends on how loaded the machine was at boot.
  // (Do not write the style tag's name in a comment here: svelte2tsx scans raw text for block tags
  // and reads one in a comment as a real element, failing `npm run check` with "script left open".)
  // Opacity, not just visibility: the failsafe's own first keyframe is `opacity: 0; visibility:
  // visible`, so during its 0.4s fade an element is nominally visible while still unreadable. On
  // visibility alone that counts as read, the entrance is skipped, and `disarm()` then removes the
  // half-played failsafe, snapping the section to full opacity in one frame. Exactly the pop this
  // guard exists to avoid.
  const alreadyRead = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.top >= window.innerHeight || r.bottom <= 0) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && Number(s.opacity) > 0.5
  }
  // Poster only, no playback, when the visitor asked for less motion. Reactive (the repo's
  // convention, see MarkdownEditor) rather than a snapshot, so turning Reduce Motion on mid-visit
  // stops the screencasts instead of leaving them playing until a reload.
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  onMount(() => {
    // The entrance is decided once, so this one is a snapshot on purpose.
    const reduced = still.current
    const disposers: Array<() => void> = []
    let cancelled = false

    // The scroll reveals' from-state is painted by CSS (`data-motion` below) because GSAP lands
    // well after first paint and would otherwise hide a section the visitor is already reading.
    // Clear it once GSAP owns them.
    const disarm = () => rootEl?.removeAttribute('data-motion')

    // GSAP: scroll reveals and the hero parallax. The hero entrance is CSS, see the stylesheet.
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return
        gsap.registerPlugin(ScrollTrigger)
        disposers.push(() => ScrollTrigger.getAll().forEach((t) => t.kill()))
        if (reduced) return // reveals stay put; content is already visible

        const root = rootEl
        gsap.ticker.lagSmoothing(0)

        // The hero entrance is not here: it is a load animation, so it is pure CSS at the foot of
        // this file. GSAP only owns what depends on scrolling.

        // One entrance for every scroll reveal. The transition juggling is the point: Tailwind's
        // `transition` utility (on the feature cards and the phone figures, for their hover lift)
        // puts opacity AND transform on a 150ms CSS transition, which re-interpolates every
        // per-frame value GSAP writes. Left alone those cards smear and land ~250ms late, late
        // enough that the section below starts revealing while this one is still blank. Suspend
        // it for the entrance and hand it back afterwards, so the hover lift still works.
        const enter = (trigger: HTMLElement, targets: ArrayLike<Element>, duration: number, stagger = 0) => {
          const els = Array.from(targets) as HTMLElement[]
          if (els.some(alreadyRead)) return
          els.forEach((el) => (el.style.transition = 'none'))
          gsap.fromTo(
            els,
            { autoAlpha: 0, y: 28 },
            {
              autoAlpha: 1,
              duration,
              ease: 'power3.out',
              onComplete: () => els.forEach((el) => (el.style.transition = '')),
              scrollTrigger: { start: 'top 82%', trigger },
              stagger,
              y: 0,
            },
          )
        }

        // The element itself, never a child: which one it used to pick depended on an incidental
        // child count, and the CSS from-state below has to be able to name the animated set.
        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => enter(el, [el], 0.8))
        root.querySelectorAll<HTMLElement>('[data-stagger]').forEach((grid) => enter(grid, grid.children, 0.7, 0.08))

        const hero = root.querySelector('[data-hero]')
        const heroSvg = root.querySelector('[data-hero] > svg')
        if (hero && heroSvg) {
          gsap.to(heroSvg, {
            ease: 'none',
            scrollTrigger: { end: 'bottom top', scrub: true, start: 'top top', trigger: hero },
            yPercent: 12,
          })
        }
      })
      .catch(() => {})
      .finally(disarm)

    return () => {
      cancelled = true
      disposers.forEach((d) => d())
    }
  })
</script>

<svelte:head>
  <title>{PUBLIC_APPLICATION_NAME} · {m.landing_tagline()}</title>
  <meta name="description" content={m.landing_metaDescription()} />
</svelte:head>

<!-- Section striping is automatic: `nth-of-type` counts only sibling <section>s, so the header
     and footer never shift it, and adding or removing a section re-flows the stripes on its
     own. Do not hardcode a background on a section. -->
<div
  bind:this={rootEl}
  data-motion="armed"
  class="text-surface-950-50 bg-surface-50-950 min-h-dvh overflow-x-clip [&>section:nth-of-type(even)]:bg-surface-100-900"
>
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
        <!-- Ordered top of frame to bottom so the five lines read as one landscape resolving.
             `--i` is what actually sequences the draw, not DOM order, so a sixth path needs its
             own `--i`: without one it falls back to 0 and draws under the first line. Same for the
             hero's `--i: 0..5` below. -->
        <path
          data-contour
          pathLength="1"
          style="--i: 0"
          d="M-100 130 C 260 60 500 170 840 100 C 1140 40 1320 130 1540 70"
        />
        <path
          data-contour
          pathLength="1"
          style="--i: 1"
          d="M-100 200 C 240 120 480 240 820 170 C 1120 110 1300 200 1540 140"
        />
        <path
          data-contour
          pathLength="1"
          style="--i: 2"
          d="M-100 460 C 300 380 560 520 900 440 C 1200 370 1360 460 1540 410"
          opacity="0.6"
        />
        <path
          data-contour
          pathLength="1"
          style="--i: 3"
          d="M-100 720 C 200 640 380 760 720 690 C 1060 620 1240 730 1540 660"
        />
        <path
          data-contour
          pathLength="1"
          style="--i: 4"
          d="M-100 780 C 240 700 420 820 760 750 C 1100 680 1280 790 1540 720"
        />
      </g>
    </svg>
    <div
      class="relative mx-auto grid min-h-[calc(100vh-60px)] max-w-300 grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-center gap-[clamp(24px,4vw,56px)] px-5 pt-[clamp(48px,8vh,96px)] pb-[clamp(40px,6vh,72px)]"
    >
      <div class="flex max-w-140 flex-col gap-5.5">
        <div
          data-fade
          style="--i: 0"
          class="chip bg-primary-500/15 text-primary-600-400 gap-2 self-start text-[12.5px] font-bold tracking-wide"
        >
          <Icon name="code" size={13} strokeWidth={2.4} />
          {m.landing_heroBadge()}
        </div>
        <h1
          data-fade
          style="--i: 1"
          class="text-[clamp(36px,5.6vw,62px)] leading-[1.04] font-bold tracking-[-0.03em] text-balance"
        >
          {m.landing_tagline()}
        </h1>
        <p
          data-fade
          style="--i: 2"
          class="text-surface-600-400 max-w-[52ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-pretty"
        >
          {m.landing_heroSubtitle()}
        </p>
        <div data-fade style="--i: 3" class="mt-1.5 flex flex-wrap gap-3">
          <a
            href={resolve('/auth/signup')}
            class="btn preset-filled-primary-500 h-12.5 px-6 font-semibold shadow-[0_10px_28px_-10px_var(--color-primary-500)]"
          >
            {m.landing_getStarted()}
          </a>
          <a href={resolve('/auth/signin')} class="btn preset-tonal h-12.5 px-6 font-semibold">
            {m.auth_signIn()}
          </a>
        </div>
        <div data-fade style="--i: 4" class="text-surface-500 flex items-center gap-2.5 text-[13px]">
          <Icon name="check" size={14} strokeWidth={2.2} />
          {m.landing_heroTrust()}
        </div>
      </div>

      <!-- boulder (three.js): rocked side-to-side so the routed face stays toward the viewer.
           data-fade so the right column joins the same entrance instead of being there already. -->
      <div data-fade style="--i: 5" class="relative h-[clamp(300px,52vh,640px)] min-w-0">
        <BoulderThree />
        <!-- caption chip -->
        <div
          class="chip border-surface-200-800 bg-surface-100-900/85 pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 gap-1.5 border text-[12px] whitespace-nowrap backdrop-blur-[10px]"
        >
          <span class="h-2 w-2 rounded-full bg-[oklch(0.69_0.18_52)]"></span>
          <span class="-ml-0.75 h-2 w-2 rounded-full bg-[oklch(0.72_0.15_150)]"></span>
          <span class="-ml-0.75 h-2 w-2 rounded-full bg-[oklch(0.62_0.22_28)]"></span>
          {m.landing_heroCaption()}
        </div>
      </div>
    </div>
  </section>

  <!-- ===== why grnyte: the three situations an area cannot be published in ===== -->
  <section class="border-surface-200-800 border-t">
    <div class="mx-auto max-w-300 px-5 py-[clamp(64px,10vh,110px)]">
      <div data-reveal class="mx-auto flex max-w-190 flex-col gap-6">
        <div class="text-primary-600-400 text-[12.5px] font-bold tracking-widest uppercase">
          {m.landing_whyEyebrow()}
        </div>
        <h2 class="text-[clamp(26px,3.4vw,38px)] leading-[1.15] font-bold tracking-tight text-balance">
          {m.landing_whyTitle()}
        </h2>
      </div>

      <div
        data-stagger
        class="mx-auto mt-11 grid max-w-250 grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5"
      >
        {#each reasons as s (s.title)}
          <div class="border-surface-200-800 flex flex-col gap-2.5 rounded-2xl border border-dashed p-6">
            <span class="text-surface-500 flex h-9 w-9 items-center justify-center">
              <Icon name={s.icon} size={21} strokeWidth={1.9} />
            </span>
            <h3 class="text-surface-600-400 text-[16px] font-bold tracking-tight">{s.title}</h3>
            <p class="text-surface-500 text-[14.5px] leading-relaxed text-pretty">{s.body}</p>
          </div>
        {/each}
      </div>

      <p
        data-reveal
        class="mx-auto mt-11 max-w-[46ch] text-center text-[clamp(17px,2vw,21px)] leading-snug font-semibold text-balance"
      >
        {m.landing_whyClose()}
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
        <p class="text-surface-600-400 text-[14.5px] leading-relaxed text-pretty">{m.landing_peekPlatform()}</p>
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
            <div
              class="border-surface-200-800 bg-surface-950 aspect-9/19.5 w-full rounded-4xl border p-2.25 shadow-[0_44px_80px_-36px_black,inset_0_0_0_1px_oklch(0.28_0.01_305)]"
            >
              <div class="lp-screen bg-surface-100-900 relative h-full w-full overflow-hidden rounded-[23px]">
                {#if s.src != null && !still.current}
                  <!-- svelte-ignore a11y_media_has_caption -- muted loop, no audio track -->
                  <video
                    src={s.src}
                    poster={s.poster}
                    preload="none"
                    autoplay
                    muted
                    loop
                    playsinline
                    class="absolute inset-0 h-full w-full object-cover"
                  ></video>
                {:else if s.poster != null}
                  <img
                    src={s.poster}
                    alt={s.caption}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    fetchpriority={i === 0 ? 'high' : 'auto'}
                    class="absolute inset-0 h-full w-full object-cover"
                  />
                {:else}
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
                  <div class="absolute right-0 bottom-4 left-0 flex justify-center">
                    <span class="chip preset-tonal-surface font-mono text-[12px] font-semibold">
                      {m.landing_peekPreviewSoon()}
                    </span>
                  </div>
                {/if}
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
  <section class="border-surface-200-800 border-t">
    <div class="mx-auto max-w-300 px-5 py-[clamp(64px,10vh,110px)]">
      <div data-reveal class="mb-11 flex max-w-160 flex-col gap-3.5">
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

  <!-- ===== for communities, clubs and access groups ===== -->
  <section class="border-surface-200-800 border-t">
    <div data-reveal class="mx-auto flex max-w-190 flex-col gap-6 px-5 py-[clamp(64px,10vh,110px)]">
      <div class="text-primary-600-400 text-[12.5px] font-bold tracking-widest uppercase">
        {m.landing_stewardEyebrow()}
      </div>
      <h2 class="text-[clamp(26px,3.4vw,38px)] leading-[1.15] font-bold tracking-tight text-balance">
        {m.landing_stewardTitle()}
      </h2>
      <p class="text-surface-600-400 text-[clamp(15.5px,1.5vw,18px)] leading-relaxed text-pretty">
        {m.landing_stewardBody()}
      </p>
      <div
        class="border-surface-200-800 mt-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5.5"
      >
        <p class="max-w-[46ch] text-[15px] leading-relaxed font-semibold text-pretty">{m.landing_stewardCta()}</p>
        <a href={contact} class="btn preset-tonal-primary h-11 gap-2 px-5 font-semibold">
          <Icon name="at-sign" size={16} strokeWidth={2.1} />
          {m.landing_stewardCtaLabel()}
        </a>
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
            <a href={resolve('/auth/signup')} class="btn preset-filled-surface-50-950 h-12.5 px-6 font-semibold">
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
  <section class="border-surface-200-800 border-t">
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
            href="https://status.grnyte.rocks"
            target="_blank"
            rel="noopener"
            class="text-surface-600-400 hover:text-surface-950-50 text-[13px] font-semibold no-underline transition-colors"
          >
            {m.landing_footerStatus()}
          </a>
        </div>
        <div class="flex flex-wrap gap-16">
          <div class="flex flex-col gap-2.5">
            <div class="text-surface-950-50 text-[13px] font-bold">{m.landing_footerHelp()}</div>
            <a
              href={resolve('/faq')}
              class="text-surface-500 hover:text-surface-950-50 text-[13px] no-underline transition-colors"
            >
              {m.faq_title()}
            </a>
          </div>

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

<style>
  @media (prefers-reduced-motion: no-preference) {
    /* The hero entrance runs on load, not on scroll, so it needs nothing from JS and is done here.
       That is the whole point: GSAP is a dynamic import behind hydration, and on a busy machine or
       in a dev server serving a few hundred unbundled modules it can resolve a second or more in,
       by which time the hero has been on screen long enough that starting an entrance would be
       worse than skipping one. CSS has no such race, so the hero always animates, in every
       browser, with no from-state to hand over and nothing to flash.
       `--i` is the position in the entrance, set per element in the markup because the six of them
       are not siblings. Timings match what GSAP used to run: power3.out is easeOutQuart and
       power2.out is easeOutCubic. */
    [data-hero] [data-fade] {
      animation: hero-rise 0.85s cubic-bezier(0.165, 0.84, 0.44, 1) calc(100ms + var(--i, 0) * 90ms) backwards;
    }

    /* `pathLength="1"` in the markup renormalises each path to a unit length, so one dash of 1
       covers any of them exactly. No constant to outgrow, nothing to measure, and the draw stays
       correct if a path is ever redrawn or the viewBox widened. */
    [data-contour] {
      animation: contour-draw 1.6s cubic-bezier(0.215, 0.61, 0.355, 1) calc(100ms + var(--i, 0) * 120ms) backwards;
      stroke-dasharray: 1;
    }

    /* The scroll reveals do need GSAP, so they keep a from-state that GSAP takes over from, and a
       failsafe in case it never arrives. It has to be CSS as well: a timer in onMount cannot help a
       visitor whose JS is only slow, because onMount has not run either, and a noscript block only
       covers scripting being switched off. A CSS animation outranks inline styles while it is
       filling, which is what lets it override GSAP, and is why `disarm()` removes the attribute
       rather than leaving the rule matching. */
    [data-motion='armed'] [data-reveal],
    [data-motion='armed'] [data-stagger] > * {
      animation: motion-failsafe 0.4s ease-out 1.2s forwards;
      opacity: 0;
      visibility: hidden;
    }
  }

  @keyframes hero-rise {
    from {
      opacity: 0;
      transform: translateY(26px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes contour-draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes motion-failsafe {
    from {
      opacity: 0;
      visibility: visible;
    }
    to {
      opacity: 1;
      visibility: visible;
    }
  }
</style>
