<script module lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'

  /**
   * The Skeleton/Tailwind surface this app is built out of, on one screen.
   *
   * Not a component catalogue: those live next to their components. This covers the part of the
   * design system that has no component and therefore no other way to be reviewed - the utility
   * classes and theme tokens that hundreds of files apply directly.
   *
   * It exists because that surface is invisible to every check we run. `npm run check` is
   * type-level, CI has no lint step, and no test asserts a pixel. A class whose definition changes
   * under an unchanged name, or a theme token that stops resolving, ships silently. The counts in
   * each section are the real usage in `src/`, so a regression here is a regression in that many
   * places.
   *
   * Every specimen carries `data-spec` and, where a size is being asserted, `data-expect`. That is
   * what makes this mechanically checkable rather than a thing someone squints at: a sweep can read
   * the rendered box and compare it to the intent.
   */
  const { Story } = defineMeta({
    parameters: { layout: 'fullscreen' },
    tags: ['autodocs'],
    title: 'Design/Skeleton Surface',
  })

  /** Every `preset-*` in `src/`, ordered by how often it appears. */
  const PRESETS = [
    { count: 68, name: 'preset-filled-primary-500' },
    { count: 34, name: 'preset-tonal-surface' },
    { count: 28, name: 'preset-tonal' },
    { count: 21, name: 'preset-filled-surface-200-800' },
    { count: 16, name: 'preset-tonal-error' },
    { count: 16, name: 'preset-filled-surface-50-950' },
    { count: 11, name: 'preset-tonal-primary' },
    { count: 9, name: 'preset-tonal-warning' },
    { count: 8, name: 'preset-glass-neutral' },
    { count: 7, name: 'preset-tonal-success' },
    { count: 6, name: 'preset-filled-surface-100-900' },
    { count: 3, name: 'preset-outlined-surface-200-800' },
    { count: 3, name: 'preset-filled-surface-950-50' },
    { count: 2, name: 'preset-filled-error-500' },
    { count: 2, name: 'preset-filled' },
  ]

  /** Button size classes, with how many places use each. */
  const SIZES = [
    { cls: '', count: 117, label: 'btn (default)' },
    { cls: 'btn-sm', count: 28, label: 'btn-sm' },
    { cls: 'btn-lg', count: 14, label: 'btn-lg' },
  ]

  /**
   * Every `size={n}` an `<Icon>` is given in the app. Lucide renders these as the `width`/`height`
   * presentation attributes, which any CSS rule beats. A button rule that sets a width on its own
   * `svg` child would silently override all of them, so each specimen states the size it asked for
   * and a sweep can check it got it.
   */
  const ICON_SIZES = [
    { count: 43, size: 18 },
    { count: 32, size: 16 },
    { count: 25, size: 20 },
    { count: 24, size: 14 },
    { count: 16, size: 13 },
    { count: 10, size: 17 },
    { count: 9, size: 15 },
    { count: 8, size: 24 },
    { count: 6, size: 19 },
    { count: 6, size: 36 },
  ]

  const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
</script>

<!-- Buttons: every preset at every size, with and without a leading icon. Padding, line-height and
     the type scale each size maps to all live in `btn`, so a change to any of them shows up here
     as a shifted row rather than as nothing at all. -->
<Story name="Buttons">
  <div class="space-y-8 p-6">
    {#each SIZES as size (size.label)}
      <section data-spec="button-size-{size.label}">
        <h3 class="mb-3 text-sm font-semibold opacity-60">{size.label} - {size.count} uses</h3>
        <div class="flex flex-wrap items-center gap-3">
          {#each PRESETS as preset (preset.name)}
            <button
              class="btn {preset.name} {size.cls}"
              data-expect-size={size.label}
              data-spec="btn:{preset.name}:{size.label}"
              type="button"
            >
              {preset.name.replace('preset-', '')}
            </button>
          {/each}
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          {#each PRESETS.slice(0, 6) as preset (preset.name)}
            <button
              class="btn {preset.name} {size.cls}"
              data-spec="btn-with-icon:{preset.name}:{size.label}"
              type="button"
            >
              <Icon name="map-pin" size={16} />
              <span>with icon</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}

    <section data-spec="button-states">
      <h3 class="mb-3 text-sm font-semibold opacity-60">States</h3>
      <div class="flex flex-wrap items-center gap-3">
        <button class="btn preset-filled-primary-500" type="button">Enabled</button>
        <!-- Disabled matters twice over: the focus ring in app.css is a box-shadow, so any rule
             that clears box-shadow on a disabled control also clears the ring. -->
        <button class="btn preset-filled-primary-500" disabled type="button">Disabled</button>
        <button class="btn preset-tonal" type="button">Tonal</button>
        <a class="btn preset-tonal-primary" href="#buttons">Anchor as button</a>
      </div>
    </section>
  </div>
</Story>

<!-- Icon buttons. `btn-icon` sets the button's own box, so a change of box model (content-box to
     border-box, or a padding formula) changes the hit target on 54 sites. The app targets a 44px
     minimum for touch, so the measured height is the thing to watch, not the look. -->
<Story name="Icon buttons">
  <div class="space-y-8 p-6">
    <section data-spec="icon-buttons">
      <h3 class="mb-3 text-sm font-semibold opacity-60">btn-icon - 54 uses</h3>
      <div class="flex flex-wrap items-center gap-3">
        {#each PRESETS.slice(0, 8) as preset (preset.name)}
          <button class="btn-icon {preset.name}" data-spec="btn-icon:{preset.name}" type="button">
            <Icon name="arrow-left" size={18} />
          </button>
        {/each}
      </div>
    </section>

    <section data-spec="icon-button-sizes">
      <h3 class="mb-3 text-sm font-semibold opacity-60">btn-icon at each size class</h3>
      <div class="flex flex-wrap items-end gap-3">
        {#each SIZES as size (size.label)}
          <div class="flex flex-col items-center gap-1">
            <button
              class="btn-icon preset-filled-surface-200-800 {size.cls}"
              data-spec="btn-icon-size:{size.label}"
              type="button"
            >
              <Icon name="chevron-down" size={18} />
            </button>
            <span class="text-xs opacity-60">{size.label}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- The 44px touch minimum, spelled out. Several screens hand-roll this as
         `btn ... btn-lg h-12 w-12 px-0` rather than using btn-icon. -->
    <section data-spec="touch-target">
      <h3 class="mb-3 text-sm font-semibold opacity-60">Hand-rolled 44px touch targets</h3>
      <div class="flex flex-wrap items-center gap-3">
        <button
          class="btn preset-filled-surface-50-950 btn-lg h-12 w-12 px-0"
          data-expect="48"
          data-spec="touch:h-12"
          type="button"
        >
          <Icon name="arrow-up-down" size={20} />
        </button>
        <button class="btn-icon preset-tonal-surface" data-expect="44" data-spec="touch:btn-icon" type="button">
          <Icon name="grip-vertical" size={20} />
        </button>
      </div>
    </section>
  </div>
</Story>

<!--
  The one that cannot be eyeballed reliably, so it is annotated.

  Lucide sets `width`/`height` as presentation attributes on the `<svg>`. Presentation attributes
  lose to any CSS declaration, including a zero-specificity `:where()` one. So a stylesheet rule
  targeting `svg` inside a button silently overrides every explicit size in the app - and there are
  223 of them, 192 with an explicit `size=`.

  Each specimen below states the size it asked for in `data-expect`. Rendered box should equal it.
  A sweep can assert that; a person cannot tell 16 from 18 by looking.
-->
<Story name="Icon size fidelity">
  <div class="space-y-8 p-6">
    <section data-spec="icon-size-bare">
      <h3 class="mb-3 text-sm font-semibold opacity-60">Bare icons, outside any button (control)</h3>
      <div class="flex flex-wrap items-end gap-4">
        {#each ICON_SIZES as icon (icon.size)}
          <div class="flex flex-col items-center gap-1">
            <span data-expect={icon.size} data-spec="icon-bare:{icon.size}">
              <Icon name="map-pin" size={icon.size} />
            </span>
            <span class="text-xs opacity-60">{icon.size}px</span>
          </div>
        {/each}
      </div>
    </section>

    <section data-spec="icon-size-in-btn">
      <h3 class="mb-3 text-sm font-semibold opacity-60">Same icons inside .btn, must match the row above</h3>
      <div class="flex flex-wrap items-end gap-4">
        {#each ICON_SIZES as icon (icon.size)}
          <div class="flex flex-col items-center gap-1">
            <button
              class="btn preset-filled-surface-200-800"
              data-expect={icon.size}
              data-spec="icon-in-btn:{icon.size}"
              type="button"
            >
              <Icon name="map-pin" size={icon.size} />
            </button>
            <span class="text-xs opacity-60">{icon.size}px x{icon.count}</span>
          </div>
        {/each}
      </div>
    </section>

    <section data-spec="icon-size-in-btn-icon">
      <h3 class="mb-3 text-sm font-semibold opacity-60">Same icons inside .btn-icon, must match too</h3>
      <div class="flex flex-wrap items-end gap-4">
        {#each ICON_SIZES as icon (icon.size)}
          <div class="flex flex-col items-center gap-1">
            <button
              class="btn-icon preset-tonal-surface"
              data-expect={icon.size}
              data-spec="icon-in-btn-icon:{icon.size}"
              type="button"
            >
              <Icon name="map-pin" size={icon.size} />
            </button>
            <span class="text-xs opacity-60">{icon.size}px</span>
          </div>
        {/each}
      </div>
    </section>
  </div>
</Story>

<!-- Presets on their own, off a button, so a colour change is visible as a swatch rather than
     hidden behind button geometry. `preset-tonal` in particular sets both a tint and a text
     colour. `preset-glass-neutral` is ours, defined in app.css, not Skeleton's. -->
<Story name="Presets">
  <div class="p-6">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {#each PRESETS as preset (preset.name)}
        <div class="rounded-2xl p-4 {preset.name}" data-spec="preset:{preset.name}">
          <div class="text-sm font-semibold">{preset.name.replace('preset-', '')}</div>
          <div class="text-xs opacity-70">{preset.count} uses</div>
          <a class="anchor text-xs" href="#presets">an anchor inside</a>
        </div>
      {/each}
    </div>
  </div>
</Story>

<!-- Typography reads entirely from theme tokens: font family, colour, weight, letter-spacing, and
     the anchor decoration set. Those tokens are hand-authored in grnyte.css, so this section is
     where a token that stopped resolving shows up - as a silent fallback to system-ui rather than
     as an error. -->
<Story name="Typography">
  <div class="max-w-3xl space-y-6 p-6">
    <section data-spec="headings">
      {#each HEADINGS as tag (tag)}
        <svelte:element this={tag} class="mb-2" data-spec="heading:{tag}">
          {tag.toUpperCase()} - Space Grotesk, 700, -0.02em
        </svelte:element>
      {/each}
    </section>

    <section data-spec="body-copy">
      <p>Body copy in the base font, so family, colour, weight and letter spacing are all on screen to compare.</p>
      <p class="mt-2">
        Inline runs, each styled by the framework:
        <a class="anchor" href="#typography">an anchor</a>
        <strong>bold</strong>
        <em>italic</em>
        <code>inline code</code>
        <kbd class="kbd">Cmd</kbd>
        <kbd class="kbd">K</kbd>
      </p>
    </section>

    <section data-spec="anchor-states">
      <h3 class="mb-2 text-sm font-semibold opacity-60">Anchor states - 34 uses</h3>
      <div class="flex flex-wrap gap-4">
        <a class="anchor" href="#typography">Default</a>
        <a class="anchor" href="#typography" style="text-decoration: underline">Hover (forced)</a>
        <a class="anchor" href="#typography" tabindex="0">Focusable</a>
      </div>
    </section>
  </div>
</Story>

<!-- Form controls. The placeholder colour is ours, overridden unlayered in app.css for contrast,
     and it names four classes - two of which belong to the framework's input-group implementation.
     The focus ring is also ours and is a box-shadow, so it is drawn here next to a disabled control
     for comparison. -->
<Story name="Forms">
  <div class="max-w-xl space-y-4 p-6">
    <label class="label" data-spec="input-default">
      <span class="label-text">Input</span>
      <input class="input" placeholder="Placeholder contrast is overridden in app.css" type="text" />
    </label>

    <label class="label" data-spec="input-disabled">
      <span class="label-text">Disabled input</span>
      <input class="input" disabled placeholder="Disabled" type="text" />
    </label>

    <label class="label" data-spec="textarea">
      <span class="label-text">Textarea</span>
      <textarea class="textarea" placeholder="Placeholder" rows="2"></textarea>
    </label>

    <label class="label" data-spec="select">
      <span class="label-text">Select</span>
      <select class="select">
        <option>An option</option>
      </select>
    </label>

    <div data-spec="focus-ring">
      <h3 class="mb-2 text-sm font-semibold opacity-60">
        Focus ring - tab into these; the ring is a box-shadow, not an outline
      </h3>
      <div class="flex flex-wrap gap-3">
        <button class="btn preset-filled-primary-500" type="button">Focus me</button>
        <input class="input w-40" placeholder="And me" type="text" />
      </div>
    </div>
  </div>
</Story>

<!-- Cards and chips: the two containers the app leans on hardest, 264 and 122 uses. -->
<Story name="Cards and chips">
  <div class="space-y-6 p-6">
    <section data-spec="cards">
      <h3 class="mb-3 text-sm font-semibold opacity-60">card - 264 uses</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="card preset-filled-surface-100-900 p-4" data-spec="card:filled">
          <h4 class="mb-1">A card</h4>
          <p class="text-sm opacity-80">With body copy and a footer action.</p>
          <button class="btn btn-sm preset-tonal mt-3" type="button">Action</button>
        </div>
        <div class="card preset-tonal-surface p-4" data-spec="card:tonal">
          <h4 class="mb-1">A tonal card</h4>
          <p class="text-sm opacity-80">The other common card treatment.</p>
        </div>
      </div>
    </section>

    <section data-spec="chips">
      <h3 class="mb-3 text-sm font-semibold opacity-60">chip - 122 uses</h3>
      <div class="flex flex-wrap gap-2">
        <span class="chip preset-tonal-surface" data-spec="chip:surface">surface</span>
        <span class="chip preset-tonal-primary" data-spec="chip:primary">primary</span>
        <span class="chip preset-tonal-success" data-spec="chip:success">success</span>
        <span class="chip preset-tonal-warning" data-spec="chip:warning">warning</span>
        <span class="chip preset-tonal-error" data-spec="chip:error">error</span>
      </div>
    </section>
  </div>
</Story>

<!-- The page ground itself. The app paints its background in two places at once: the theme, and an
     inline unlayered style block in app.html that also sets color-scheme. They have to agree, and
     nothing checks that they do, so this story puts the painted surface next to the token that is
     supposed to be painting it. -->
<Story name="Page ground">
  <div class="min-h-screen p-6" data-spec="page-ground">
    <div class="max-w-xl space-y-3">
      <h2>Page ground</h2>
      <p class="text-sm opacity-80">
        The canvas behind this text is the app background. It is set by the theme and also hardcoded in <code>
          src/app.html
        </code>
        , whose style block is unlayered and therefore wins any tie.
      </p>
      <div class="flex flex-wrap gap-3 pt-2">
        <div class="bg-surface-50-950 rounded-xl p-4 text-sm" data-spec="ground:surface-50-950">surface-50-950</div>
        <div class="bg-surface-100-900 rounded-xl p-4 text-sm" data-spec="ground:surface-100-900">surface-100-900</div>
        <div class="bg-surface-200-800 rounded-xl p-4 text-sm" data-spec="ground:surface-200-800">surface-200-800</div>
      </div>
    </div>
  </div>
</Story>
