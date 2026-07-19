<script lang="ts">
  import type { Snippet } from 'svelte'
  import { slide } from 'svelte/transition'

  interface Props {
    /** Highlight state: the keyboard-active `option` row, or the selected `card`. */
    active?: boolean
    /** Leading visual (donut, thumbnail, avatar, grade tile, …). */
    children?: Snippet
    /** Breadcrumb path; an array is joined with " · ". */
    crumbs?: string | string[]
    /** Secondary line below the title. Pass a snippet for rich content (tags, markdown). */
    description?: Snippet | string
    /**
     * Extra line below the row (tags, action buttons, …). Rendered as a sibling
     * of the interactive row inside the card shell, so it may contain links.
     */
    footer?: Snippet
    /** Render as a link. Takes precedence over `onclick`. */
    href?: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /** Trailing content (chevron, grade chip, follow button, …). */
    rightContent?: Snippet
    /** Main title. Pass a snippet for custom title markup (e.g. inline stars). */
    title: Snippet | string
    /**
     * Layout variant. `card` (default) is the bordered list-item used on the
     * Search/listing screens; `option` is the flat, tighter row used inside the
     * `@`-reference picker (no border/radius, no trailing chevron, highlightable).
     */
    variant?: 'card' | 'option'
  }

  let {
    active = false,
    children,
    crumbs,
    description,
    footer,
    href,
    onclick,
    rightContent,
    title,
    variant = 'card',
  }: Props = $props()

  const crumbText = $derived(Array.isArray(crumbs) ? crumbs.join(' · ') : crumbs)

  // Colour/state utilities differ per variant: the card carries its own surface
  // and border; the option row is transparent until hovered/keyboard-active.
  const colorClass = $derived(
    variant === 'option'
      ? active
        ? 'preset-tonal-primary text-surface-950-50'
        : 'text-surface-950-50 hover:bg-surface-200-800'
      : active
        ? 'bg-surface-200-800 border-primary-500 text-surface-950-50'
        : 'bg-surface-100-900 border-surface-200-800 text-surface-950-50 hover:bg-surface-200-800',
  )
</script>

{#snippet body()}
  {@render children?.()}

  <span class="grow">
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

<!-- The shell carries the card chrome (border, surface, radius); the row itself
     is the interactive element. Keeping the footer a *sibling* of the row means
     it can hold its own links/buttons without nesting interactives. -->
<div class="shell {variant} {colorClass}">
  {#if href}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- generic pass-through; callers resolve() the href -->
    <a class="row {variant}" {href}>
      {@render body()}
    </a>
  {:else}
    <button type="button" class="row {variant}" {onclick}>
      {@render body()}
    </button>
  {/if}

  {#if footer}
    <div class="footer" transition:slide={{ duration: 150 }}>
      {@render footer()}
    </div>
  {/if}
</div>

<style>
  .shell {
    width: 100%;
    box-sizing: border-box;
    border-radius: 16px;
    border-width: 1px;
    border-style: solid;
    transition: background-color 0.15s ease;
  }

  /* Flat picker row: no border/radius on the shell either. */
  .shell.option {
    border-width: 0;
    border-radius: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 11px 12px;
    border-radius: inherit;
    cursor: pointer;
    text-align: left;
    font-family: var(--base-font-family);
  }

  .row.option {
    padding: 7px 9px;
    gap: 9px;
  }

  .footer {
    padding: 0 12px 11px;
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
