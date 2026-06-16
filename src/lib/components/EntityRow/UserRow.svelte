<script lang="ts">
  import Icon from '../Icon/Icon.svelte'
  import { avatarGradient } from './helpers'
  import Row from './Row.svelte'

  interface Props {
    /** Display name. */
    name: string
    /** Avatar initials. */
    initials: string
    /** Secondary line, e.g. "128 ascents · 5 areas". */
    subline?: string
    /** Avatar gradient hue (oklch hue, 0–360). */
    hue?: number
    /** Render as a link. */
    href?: string
    /** Tap handler when rendered as a button. */
    onclick?: (event: MouseEvent) => void
    /** `card` (listing) or `option` (compact `@`-picker row). */
    variant?: 'card' | 'option'
    /** Keyboard-highlight state — only for the `option` variant. */
    active?: boolean
  }

  let { name, initials, subline, hue = 280, href, onclick, variant = 'card', active = false }: Props = $props()
</script>

<Row title={name} description={subline} {href} {onclick} {variant} {active}>
  <span class="avatar" class:sm={variant === 'option'} style:background={avatarGradient(hue)}>{initials}</span>

  {#snippet rightContent()}
    {#if variant !== 'option'}
      <Icon name="chevron-right" size={18} strokeWidth={2.2} class="text-surface-500 shrink-0" />
    {/if}
  {/snippet}
</Row>

<style>
  .avatar {
    width: 46px;
    height: 46px;
    flex: none;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }

  .avatar.sm {
    width: 34px;
    height: 34px;
    font-size: 13px;
  }
</style>
