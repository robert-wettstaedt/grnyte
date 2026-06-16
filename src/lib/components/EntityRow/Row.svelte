<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    /** Main title. Pass a snippet for custom title markup (e.g. inline stars). */
    title: string | Snippet
    /** Eyebrow line above the title — typically the geographic region. */
    region?: string
    /** Breadcrumb path; an array is joined with " · ". */
    crumbs?: string | string[]
    /** Secondary line below the title. Pass a snippet for rich content (tags, markdown). */
    description?: string | Snippet
    /** Leading visual (donut, thumbnail, avatar, grade tile, …). */
    children?: Snippet
    /** Trailing content (chevron, grade chip, follow button, …). */
    rightContent?: Snippet
    /** Render as a link. Takes precedence over `onclick`. */
    href?: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /**
     * Layout variant. `card` (default) is the bordered list-item used on the
     * Search/listing screens; `option` is the flat, tighter row used inside the
     * `@`-reference picker (no border/radius, no trailing chevron, highlightable).
     */
    variant?: 'card' | 'option'
    /** Keyboard-highlight state — only meaningful for the `option` variant. */
    active?: boolean
  }

  let {
    title,
    region,
    crumbs,
    description,
    children,
    rightContent,
    href,
    onclick,
    variant = 'card',
    active = false,
  }: Props = $props()

  const crumbText = $derived(Array.isArray(crumbs) ? crumbs.join(' · ') : crumbs)

  // Colour/state utilities differ per variant: the card carries its own surface
  // and border; the option row is transparent until hovered/keyboard-active.
  const colorClass = $derived(
    variant === 'option'
      ? active
        ? 'preset-tonal-primary text-surface-950-50'
        : 'text-surface-950-50 hover:bg-surface-200-800'
      : 'bg-surface-100-900 border-surface-200-800 text-surface-950-50 hover:bg-surface-200-800',
  )
</script>

{#snippet body()}
  {@render children?.()}

  <span class="grow">
    {#if region}<span class="crumb text-surface-500">{region}</span>{/if}
    {#if crumbText}<span class="crumb text-surface-500">{crumbText}</span>{/if}

    {#if typeof title === 'function'}
      {@render title()}
    {:else}
      <span class="title">{title}</span>
    {/if}

    {#if typeof description === 'function'}
      {@render description()}
    {:else if description}
      <span class="description text-surface-600-400">{description}</span>
    {/if}
  </span>

  {#if rightContent}{@render rightContent()}{/if}
{/snippet}

{#if href}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- generic pass-through; callers resolve() the href -->
  <a class="row {variant} {colorClass}" {href}>
    {@render body()}
  </a>
{:else}
  <button type="button" class="row {variant} {colorClass}" {onclick}>
    {@render body()}
  </button>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 11px 12px;
    border-radius: 16px;
    border-width: 1px;
    border-style: solid;
    cursor: pointer;
    text-align: left;
    font-family: var(--base-font-family);
    transition: background-color 0.15s ease;
  }

  /* Flat picker row: no border/radius, tighter padding. */
  .row.option {
    border-width: 0;
    border-radius: 10px;
    padding: 7px 9px;
    gap: 9px;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .crumb {
    display: block;
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    display: block;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.015em;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .description {
    display: block;
    font-size: 12.5px;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
