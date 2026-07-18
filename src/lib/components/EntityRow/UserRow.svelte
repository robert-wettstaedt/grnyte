<script lang="ts">
  import Avatar from '../Avatar/Avatar.svelte'
  import Icon from '../Icon/Icon.svelte'
  import Row from './Row.svelte'

  interface Props {
    /** Keyboard-highlight state — only for the `option` variant. */
    active?: boolean
    /** Render as a link. */
    href?: string
    /** Display name. */
    name: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /** Secondary line, e.g. "128 ascents · 5 areas". */
    subline?: string
    /** `card` (listing) or `option` (compact `@`-picker row). */
    variant?: 'card' | 'option'
  }

  let { active = false, href, name, onclick, subline, variant = 'card' }: Props = $props()
</script>

<Row title={name} description={subline} {href} {onclick} {variant} {active}>
  <Avatar {name} size={variant === 'option' ? 34 : 46} />

  {#snippet rightContent()}
    {#if variant !== 'option'}
      <Icon name="chevron-right" size={18} strokeWidth={2.2} class="text-surface-500 shrink-0" />
    {/if}
  {/snippet}
</Row>
