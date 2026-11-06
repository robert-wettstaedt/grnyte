<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import type { Snippet } from 'svelte'
  import type { ClassValue, HTMLButtonAttributes } from 'svelte/elements'
  import MediaToolTip from './MediaToolTip.svelte'
  import { MEDIA_TOOL } from './toolbar'

  interface Props {
    /** A popover or dialog trigger's props: its id and handlers belong on the button. */
    attributes?: HTMLButtonAttributes
    children?: Snippet
    /** Placement of the whole control. */
    class?: ClassValue
    fill?: string
    icon?: IconName
    key?: string
    label: string
    /** Replaces a handler from `attributes`. */
    onclick?: () => void
    /** `aria-keyshortcuts`, when it says more than `key`. */
    shortcuts?: string
  }

  const { attributes, children, class: className, fill, icon, key, label, onclick, shortcuts }: Props = $props()
</script>

<MediaToolTip class={className} {key} {label}>
  <button
    {...attributes}
    {...onclick == null ? {} : { onclick }}
    type="button"
    class={[attributes?.class, MEDIA_TOOL, 'relative']}
    aria-keyshortcuts={shortcuts ?? key?.toLowerCase()}
    aria-label={label}
  >
    {#if icon != null}
      <Icon name={icon} size={20} {fill} />
    {/if}
    {@render children?.()}
  </button>
</MediaToolTip>
