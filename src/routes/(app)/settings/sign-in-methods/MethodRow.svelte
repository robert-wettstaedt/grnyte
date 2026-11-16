<script lang="ts" module>
  export const rowAction =
    'text-primary-600-400 disabled:text-surface-500 flex-none px-0.5 py-2 text-sm font-bold disabled:font-semibold disabled:opacity-100'

  /** One height for a row and its skeleton: the two leadings below plus the padding. */
  export const rowFrame = 'flex min-h-17 items-center gap-3 px-4 py-3.5'
</script>

<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import type { Snippet } from 'svelte'

  interface Props {
    action?: Snippet
    children?: Snippet
    icon?: IconName
    on?: boolean
    status: string
    tile?: Snippet
    title: string
  }

  const { action, children, icon, on = false, status, tile, title }: Props = $props()
</script>

<div>
  <div class={rowFrame}>
    <span
      class="bg-surface-100-900 flex size-9 flex-none items-center justify-center rounded-[10px]"
      aria-hidden="true"
    >
      {#if tile != null}
        {@render tile()}
      {:else if icon != null}
        <Icon name={icon} size={18} />
      {/if}
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="text-[15px] leading-[22px] font-semibold">{title}</span>
      <span
        class={['text-[12.5px] leading-[18px]', on ? 'text-success-600-400 font-semibold' : 'text-surface-600-400']}
      >
        {status}
      </span>
    </span>
    {@render action?.()}
  </div>
  {@render children?.()}
</div>
